import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Check, CheckCheck, ChevronRight, PackageCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { getReceivePurchaseOrder, receivePurchaseOrder } from '@/lib/purchase.functions';
import { DISPUTE_REASON_LABEL, type DisputeReason } from '@/lib/purchase';
import { qty } from '@/lib/inventory';
import { OUTCOMES, confirmUntouched, initialReceiveDraft, receivePayload, receiveSummary, receiveLineColumns, type ReceiveDraft } from './receive-outcomes';

/** Local draft until one atomic final confirmation. Supplier declarations remain read-only. */
export function ReceiveGoodsPanel({ orderId, deliveryId = null, onDone }: { orderId: string; deliveryId?: string | null; onDone: () => void }) {
  const read = useServerFn(getReceivePurchaseOrder);
  const receive = useServerFn(receivePurchaseOrder);
  const cache = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, ReceiveDraft>>({});
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
  const [key, setKey] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const bundle = useQuery({ queryKey: ['receive-purchase-order', orderId, deliveryId], queryFn: () => read({ data: { orderId, deliveryId } }), staleTime: 0, refetchOnWindowFocus: false });
  const companyId = bundle.data?.companyId;
  const archiveId = bundle.data?.archiveId;
  const units = useQuery({ queryKey: ['company-units-for-price', companyId], enabled: Boolean(companyId), queryFn: async () => {
    if (!companyId) return [];
    const { data, error } = await supabase.from('units_of_measure').select('id, code').eq('company_id', companyId).eq('status', 'attivo').order('code');
    if (error) throw new Error(error.message); return data ?? [];
  } });
  const products = useQuery({ queryKey: ['receipt-substitute-products', companyId, archiveId], enabled: Boolean(companyId && archiveId && Object.values(openDetails).some(Boolean)), queryFn: async () => {
    if (!companyId || !archiveId) return [];
    const { data, error } = await supabase.from('products').select('id, code, description, stock_unit_id, units_of_measure!products_stock_unit_id_fkey(code)').eq('company_id', companyId).eq('archive_id', archiveId).order('description');
    if (error) throw new Error(error.message); return data ?? [];
  } });
  const lines = bundle.data?.lines ?? [];
  const delivery = bundle.data?.delivery;
  const frozenDeclaration = Boolean(delivery && delivery.status !== 'bozza');
  const supplierDeclared = frozenDeclaration && delivery?.origin !== 'operatore_interno';
  const supplierDraft = delivery?.status === 'bozza' && delivery.origin !== 'operatore_interno';
  const summary = receiveSummary(lines, drafts);
  const change = (id: string, initial: ReceiveDraft, patch: Partial<ReceiveDraft>) => setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] ?? initial), ...patch } }));
  const confirm = useMutation({ mutationFn: async () => {
    const b = bundle.data;
    if (!b) throw new Error('Attendi il caricamento dell’ordine');
    const payload = lines.map(line => receivePayload(line, drafts[line.key] ?? initialReceiveDraft(line), frozenDeclaration));
    if (!payload.some(p => p.verified_quantity > 0 || (p.substitute_quantity ?? 0) > 0)) throw new Error('Nessuna merce da caricare: indica almeno una quantità arrivata. Non è stato registrato nulla.');
    const requestKey = key ?? crypto.randomUUID(); setKey(requestKey);
    return receive({ data: { orderId, deliveryId: b.delivery?.id ?? null, deliveryVersion: b.delivery?.version ?? null, orderVersion: b.orderVersion, key: requestKey, lines: payload, notes: null } });
  }, onSuccess: async result => {
    setDone(result.receipt_id);
    await Promise.all(['purchase-orders', 'purchase-orders-seen', 'order-items', 'order-deliveries', 'order-receipts', 'goods-receipt', 'goods-receipt-items', 'product-stock', 'product-lots', 'supplier-order-card-lines', 'inventory-stock', 'purchase-delivery-comparison'].map(queryKey => cache.invalidateQueries({ queryKey: [queryKey] })));
    toast.success('Carico confermato: provenienze e giacenza aggiornate');
  }, onError: (error: Error) => toast.error(error.message) });
  if (bundle.isPending) return <p className="text-sm text-muted-foreground">Caricamento ricezione…</p>;
  if (bundle.isError) return <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{bundle.error.message}</p><Button variant="outline" onClick={() => bundle.refetch()}>Riprova</Button></div>;
  if (done) return <section className="space-y-3"><p className="flex items-center gap-2 font-semibold"><PackageCheck className="size-5 text-success" />Carico confermato</p><Button onClick={onDone}>Visualizza ordine aggiornato</Button></section>;
  return <section className="space-y-4" aria-label="Ricezione merce">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-semibold">Registra arrivo merce</h3>
      <Button variant="outline" disabled={confirm.isPending || supplierDraft || !lines.length} onClick={() => setDrafts(prev => confirmUntouched(lines, prev))}><CheckCheck className="mr-2 size-4" />Conferma tutte come arrivate</Button>
    </div>
    {supplierDraft ? <p className="text-sm text-muted-foreground">Il fornitore sta ancora compilando la consegna. Attendi il suo dichiarato.</p> : null}
    {bundle.data?.incassiDocuments?.length ? <p className="text-sm text-muted-foreground">Merce dichiarata dal fornitore nel documento {bundle.data.incassiDocuments.map(d => `DDT ${d.docNumber ?? ''}`).join(', ')}: controlla e conferma riga per riga. Niente va in magazzino finché non premi «Conferma carico».</p> : null}
    {lines.map(line => {
      const initial = initialReceiveDraft(line);
      const draft = drafts[line.key] ?? initial;
      const checked = draft.outcome;
      const details = openDetails[line.key] ?? false;
      const cols = receiveLineColumns(line);
      const replacement = products.data?.find(p => p.id === draft.substituteProductId);
      return <article key={line.key} className="min-w-0 border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-xs text-muted-foreground">{line.code}</p><h4 className="break-words font-semibold">{line.name}</h4>{line.lineType === 'sostituzione' ? <Badge variant="outline">Sostituzione</Badge> : line.lineType === 'aggiunta_fornitore' ? <Badge variant="outline">Aggiunto dal fornitore</Badge> : null}</div>
          <div className="grid w-full grid-cols-3 gap-3 text-sm sm:w-auto sm:gap-6"><div className="min-w-0"><span className="block text-xs text-muted-foreground">Ordinato</span><strong className="break-words">{cols.ordered}</strong>{!frozenDeclaration && line.ordered !== line.baseline ? <span className="block text-xs">Da ricevere: {qty(line.baseline)} {line.unitCode}</span> : null}</div>
          <div className="min-w-0"><span className="block text-xs text-muted-foreground">{supplierDeclared ? 'Arrivato (fornitore)' : cols.ddt ? `Arrivato (DDT ${cols.ddt.docNumber ?? ''})` : 'Arrivato'}</span>{cols.arrived ? <strong className={`break-words ${cols.ddt?.status === 'differenza' ? 'text-destructive' : ''}`}>{cols.arrived}</strong> : <span className="text-xs text-muted-foreground">{cols.ddt ? 'Da controllare' : 'In attesa del documento'}</span>}{cols.ddt && cols.ddt.status !== 'abbinata' ? <span className={`block text-xs ${cols.ddt.status === 'differenza' ? 'text-destructive' : 'text-muted-foreground'}`}>{cols.ddt.status === 'differenza' ? `Ordinati ${cols.ordered} · sul documento ${cols.arrived}` : `Da controllare: ${cols.ddt.reason ?? ''}`}</span> : null}{cols.arrivedStock ? <span className="block text-xs text-muted-foreground">= {cols.arrivedStock}</span> : null}{line.lot ? <span className="block text-xs text-muted-foreground">Lotto {line.lot}</span> : null}</div>
          {cols.price ? <div className="min-w-0"><span className="block text-xs text-muted-foreground">Prezzo</span><strong className="break-words">{cols.price}</strong></div> : <div />}</div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {OUTCOMES.map(([value, label]) => <Button key={value} size="sm" variant={checked === value ? 'default' : 'outline'} aria-pressed={checked === value} disabled={confirm.isPending || supplierDraft} onClick={() => change(line.key, initial, { outcome: value })}>{checked === value ? <Check className="mr-1 size-3.5" /> : null}{label}</Button>)}
          {!frozenDeclaration ? <span className="text-sm font-medium">{qty(line.baseline)} {line.unitCode}</span> : null}
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {checked === 'parziale' || checked === 'danneggiato' ? <label className="text-xs text-muted-foreground">Quantità arrivata ({line.unitCode})<Input className="mt-1" inputMode="decimal" value={draft.quantity} disabled={confirm.isPending} onChange={e => change(line.key, initial, { quantity: e.target.value })} /></label> : null}
          {checked === 'danneggiato' ? <><label className="text-xs text-muted-foreground">Quantità buona ({line.unitCode})<Input className="mt-1" inputMode="decimal" value={draft.goodQuantity} disabled={confirm.isPending} onChange={e => change(line.key, initial, { goodQuantity: e.target.value })} /></label><label className="text-xs text-muted-foreground">Motivo<Select value={draft.reason} onValueChange={value => change(line.key, initial, { reason: value as DisputeReason })} disabled={confirm.isPending}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DISPUTE_REASON_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label></> : null}
          {checked === 'mancante' ? <label className="text-xs text-muted-foreground">Motivo della mancanza<Input className="mt-1" value={draft.missingReason} disabled={confirm.isPending} onChange={e => change(line.key, initial, { missingReason: e.target.value })} /></label> : null}
          {!line.sameUnit && checked && checked !== 'mancante' ? <><label className="text-xs text-muted-foreground">Quantità effettiva arrivata ({line.stockUnitCode ?? 'U.M. magazzino'})<Input className="mt-1" inputMode="decimal" value={draft.stockQuantity} disabled={confirm.isPending} onChange={e => change(line.key, initial, { stockQuantity: e.target.value })} /></label>{checked === 'danneggiato' ? <label className="text-xs text-muted-foreground">Quantità buona ({line.stockUnitCode ?? 'U.M. magazzino'})<Input className="mt-1" inputMode="decimal" value={draft.goodStockQuantity} disabled={confirm.isPending} onChange={e => change(line.key, initial, { goodStockQuantity: e.target.value })} /></label> : null}</> : null}
        </div>
        <Button variant="ghost" size="sm" className="mt-2" aria-expanded={details} onClick={() => setOpenDetails(prev => ({ ...prev, [line.key]: !details }))}><ChevronRight className={`mr-1 size-4 transition-transform ${details ? 'rotate-90' : ''}`} />Dettagli riga</Button>
        {details ? <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {([['producer', 'Produttore'], ['lot', 'Lotto'], ['expiry', 'Scadenza'], ['unitCost', 'Prezzo'], ['priceUnitCode', 'U.M. del prezzo'], ['priceQuantity', 'Quantità del prezzo']] as const).map(([field, label]) => <label key={field} className="text-xs text-muted-foreground">{label}<Input className="mt-1" type={field === 'expiry' ? 'date' : 'text'} inputMode={field === 'unitCost' || field === 'priceQuantity' ? 'decimal' : 'text'} value={draft[field]} disabled={confirm.isPending} list={field === 'priceUnitCode' ? `receive-price-units-${line.key}` : undefined} onChange={e => change(line.key, initial, { [field]: e.target.value })} /></label>)}
          <datalist id={`receive-price-units-${line.key}`}>{(units.data ?? []).map(unit => <option key={unit.id} value={unit.code} />)}</datalist>
          {!frozenDeclaration && checked === 'mancante' ? <><label className="text-xs text-muted-foreground">Prodotto sostitutivo<Select value={draft.substituteProductId || 'none'} disabled={confirm.isPending} onValueChange={value => change(line.key, initial, { substituteProductId: value === 'none' ? '' : value })}><SelectTrigger className="mt-1"><SelectValue placeholder="Nessuno" /></SelectTrigger><SelectContent><SelectItem value="none">Nessuno</SelectItem>{(products.data ?? []).filter(p => p.stock_unit_id && p.id !== line.productId).map(p => <SelectItem key={p.id} value={p.id}>{p.code} · {p.description}</SelectItem>)}</SelectContent></Select></label>{draft.substituteProductId ? <label className="text-xs text-muted-foreground">Quantità sostitutiva ({replacement?.units_of_measure?.code ?? 'U.M. magazzino'})<Input className="mt-1" inputMode="decimal" value={draft.substituteQuantity} disabled={confirm.isPending} onChange={e => change(line.key, initial, { substituteQuantity: e.target.value })} /></label> : null}</> : null}
        </div> : null}
      </article>;
    })}
    {bundle.data?.incassiUnmatched?.length ? <div className="rounded-md border border-border p-3 text-sm"><p className="font-medium">Righe del documento non abbinate · da controllare</p><ul className="mt-1 space-y-1 text-muted-foreground">{bundle.data.incassiUnmatched.map((l, i) => <li key={i} className="break-words">{l.code ?? '—'} {l.description ?? ''} · {l.qty ?? '—'} {l.um ?? ''}{l.price != null ? ` · ${l.price.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : ''}</li>)}</ul></div> : null}
    {!lines.length ? <p className="text-sm text-muted-foreground">Nessun prodotto da ricevere.</p> : null}
    <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background py-3 lg:bottom-2">
      <p className="text-sm">{summary.ok} OK · {summary.parziale} parziali · {summary.mancante} mancanti · {summary.danneggiato} danneggiati{summary.untouched ? <span className="block text-xs text-muted-foreground">{summary.untouched} da verificare</span> : null}</p>
      <Button className="font-bold" disabled={confirm.isPending || supplierDraft || !lines.length || summary.untouched > 0} onClick={() => confirm.mutate()}><PackageCheck className="mr-2 size-4" />{confirm.isPending ? 'Conferma in corso…' : 'Conferma carico'}</Button>
    </div>
  </section>;
}
