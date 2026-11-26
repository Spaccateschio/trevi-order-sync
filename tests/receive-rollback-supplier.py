"""Authenticated 3 EMME-only integration test. Requires the temporary test RPC
from migration 0119; it must be removed after validation. All writes made
by the receipt chain run inside an intentionally rolled-back subtransaction.
Run after lovable auth-session --json --self. Never test ORD 00003/00004/00005.
"""
import asyncio
from playwright.async_api import async_playwright
from lovable_playwright_defaults import signed_in_context

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await signed_in_context(browser)
  page=await context.new_page()
  await page.goto('http://localhost:8080/acquisti/ordini',wait_until='domcontentloaded')
  await page.get_by_text('ORD-2026-00014',exact=True).wait_for(timeout=45000)
  result=await page.evaluate('''async () => {
    const {supabase:db}=await import('/src/integrations/supabase/client.ts');
    const {getReceivePurchaseOrder:read}=await import('/src/lib/purchase.functions.ts');
    const {initialReceiveDraft,receivePayload}=await import('/src/components/purchase/receive-outcomes.ts');
    const {data:companies,error:ce}=await db.from('companies').select('id,legal_name').eq('legal_name','3 EMME ROMA SRL');
    if(ce || companies?.length!==1) throw Error('Test company unavailable');
    const company=companies[0];
    const {data:order,error:oe}=await db.from('purchase_orders').select('id,number').eq('company_id',company.id).eq('number','ORD-2026-00014').single();
    if(oe || !order) throw Error('Test order unavailable');
    const {data:deliveries,error:de}=await db.from('purchase_deliveries').select('id,status,origin').eq('order_id',order.id);
    if(de) throw Error(de.message);
    const declared=deliveries.find(d=>d.status==='dichiarata' && d.origin==='fornitore_link_esterno');
    if(!declared) throw Error('Supplier declared fixture required');
    const snapshot=async()=>{
      const tables=['purchase_orders','purchase_order_items','purchase_deliveries','purchase_delivery_items','purchase_delivery_disputes','purchase_delivery_line_events','goods_receipts','goods_receipt_items','stock_lots','inventory_movements','audit_events','notifications','supplier_price_observations','supplier_price_series','stock_lot_reconciliations'];
      const values={};
      for(const t of tables){const {data,error}=await db.from(t).select('*').eq('company_id',company.id).order('id');if(error)throw Error(t+':'+error.message);values[t]=data;}
      return values;
    };
    const results=[];
    for(const fixture of [declared]) {
    const b=await read({data:{orderId:order.id,deliveryId:fixture.id}});
    if(b.delivery?.id!==fixture.id) throw Error('Wrong supplier declaration loaded');
    const before=await snapshot();
    const lines=b.lines.map((l,index)=>{
      const d={...initialReceiveDraft(l),outcome:'ok'};
      if(!l.sameUnit){d.stockQuantity='12';d.goodStockQuantity='12';}
      if(index===0){
        d.outcome='danneggiato';d.goodQuantity=String(l.baseline/2);d.goodStockQuantity='6';
      }
      if(index===1){d.outcome='mancante';d.missingReason='Arriva domani';}
      if(index===2){d.outcome='danneggiato';d.goodQuantity=String(l.baseline/2);d.goodStockQuantity='6';}
      return receivePayload(l,d,Boolean(b.delivery && b.delivery.status!=='bozza'));
    });
    const input={order_id:order.id,order_version:b.orderVersion,delivery_id:b.delivery?.id??null,delivery_version:b.delivery?.version??null,request_key:crypto.randomUUID(),lines};
    const {data:result,error}=await db.rpc('test_receive_purchase_order_rollback',{_input:input});
    if(error) throw Error(error.message);
    const after=await snapshot();
    if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Rollback did not preserve snapshots');
    const {data:receipt}=await db.from('goods_receipts').select('id').eq('id',result.receipt_id);
    if(receipt?.length)throw Error('Test receipt persisted');
    if(!result.completed || !result.rolled_back || result.disputes_created<1)throw Error('Dispute chain not verified');
    if(fixture.status==='dichiarata' && !result.supplier_declared_unchanged)throw Error('Supplier declaration changed');
    if(!result.notification_name_verified)throw Error('Supplier name not verified');
    results.push({...result,receipt_id:undefined,delivery_id:undefined,unchangedTables:Object.keys(before).length});
    }
    return results;
  }''')
  print(result)
  assert len(result)==1
  for scenario in result:
   assert scenario['completed'] and scenario['rolled_back'] and scenario['unchangedTables']==15
  await browser.close()
asyncio.run(main())
