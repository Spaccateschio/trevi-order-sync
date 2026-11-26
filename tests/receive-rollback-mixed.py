"""Authenticated 3 EMME-only integration test. Requires the temporary test RPC
from migration 0116; migration 0117 removes it after validation. All writes made
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
  await page.get_by_text('ORD-2026-00026',exact=True).wait_for(timeout=45000)
  result=await page.evaluate('''async () => {
    const {supabase:db}=await import('/src/integrations/supabase/client.ts');
    const {getReceivePurchaseOrder:read}=await import('/src/lib/purchase.functions.ts');
    const {initialReceiveDraft,receivePayload}=await import('/src/components/purchase/receive-outcomes.ts');
    const {data:companies,error:ce}=await db.from('companies').select('id,legal_name').eq('legal_name','3 EMME ROMA SRL');
    if(ce || companies?.length!==1) throw Error('Test company unavailable');
    const company=companies[0];
    const {data:order,error:oe}=await db.from('purchase_orders').select('id,number').eq('company_id',company.id).eq('number','ORD-2026-00026').single();
    if(oe || !order) throw Error('Test order unavailable');
    const b=await read({data:{orderId:order.id,deliveryId:null}});
    const snapshot=async()=>{
      const tables=['purchase_orders','purchase_deliveries','purchase_delivery_items','goods_receipts','goods_receipt_items','stock_lots','inventory_movements','audit_events','notifications'];
      const values={};
      for(const t of tables){const {data,error}=await db.from(t).select('*').eq('company_id',company.id).order('id');if(error)throw Error(t+':'+error.message);values[t]=data;}
      return values;
    };
    const before=await snapshot();
    const lines=b.lines.map((l,index)=>{
      const d={...initialReceiveDraft(l),outcome:'ok'};
      if(!l.sameUnit){d.stockQuantity='12';d.goodStockQuantity='12';}
      if(index===0){d.outcome='parziale';d.quantity=String(l.baseline/2);d.stockQuantity='6';}
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
    if(receipt.length)throw Error('Test receipt persisted');
    return {completed:result.completed,rolledBack:result.rolled_back,unchangedTables:Object.keys(before).length};
  }''')
  print(result)
  assert result['completed'] and result['rolledBack'] and result['unchangedTables']==9
  await browser.close()
asyncio.run(main())
