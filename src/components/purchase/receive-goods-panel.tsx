import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Check, CheckCheck, ChevronDown, ChevronRight, PackageCheck } from 'lucide-react';
import { useState } from 'react';
import { useDragScroll } from '@/hooks/use-drag-scroll';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { getReceivePurchaseOrder, receivePurchaseOrder } from '@/lib/purchase.functions';
import { DISPUTE_REASON_LABEL, type DisputeReason } from '@/lib/purchase';
import { qty } from '@/lib/inventory';
import { chooseReceiveOutcome, chooseOkDraft, canConfirmReceipt, confirmUntouched, initialReceiveDraft, isOkOutcome, isWeightLine, receiveBlockingLabel, receiveCountsLabel, receivePayload, receiveRowHint, receiveRowIndicator, receiveSheetMoney, requestedPreparedLabel, type ReceiveDraft, type ReceiveLine, type ReceiveOutcome } from './receive-outcomes';

/** Local draft until one atomic final confirmation. Supplier declarations remain read-only. */
const itDate = (iso: string | null) => iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('it-IT') : null;

export function ReceiveGoodsPanel({ orderId, deliveryId = null, onDone, onConfirmed, orderNumber = null, supplierName = null }: { orderId: string; deliveryId?: string | null; onDone: () => void; onConfirmed?: () => void; orderNumber?: string | null; supplierName?: string | null }) {
  const read = useServerFn(getReceivePurchaseOrder);
  const receive = useServerFn(receivePurchaseOrder);
  const cache = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, ReceiveDraft>>({});
  const listDrag = useDragScroll<HTMLUListElement>();
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
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
  const hasDelivery = Boolean(delivery);
  const change = (id: string, initial: ReceiveDraft, patch: Partial<ReceiveDraft>) => setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] ?? initial), ...patch } }));
  const confirm = useMutation({ mutationFn: async () => {
    const b = bundle.data;
    if (!b) throw new Error('Attendi il caricamento dell’ordine');
    const payload = lines.map(line => receivePayload(line, drafts[line.key] ?? initialReceiveDraft(line, hasDelivery), frozenDeclaration));
    if (!payload.some(p => p.verified_quantity > 0 || (p.substitute_quantity ?? 0) > 0)) throw new Error('Nessuna merce da caricare: indica almeno una quantità arrivata. Non è stato registrato nulla.');
    const requestKey = key ?? crypto.randomUUID(); setKey(requestKey);
    return receive({ data: { orderId, deliveryId: b.delivery?.id ?? null, deliveryVersion: b.delivery?.version ?? null, orderVersion: b.orderVersion, key: requestKey, lines: payload, notes: null } });
  }, onSuccess: async result => {
    setDone(result.receipt_id);
    await Promise.all(['purchase-orders', 'purchase-orders-seen', 'order-items', 'order-deliveries', 'order-receipts', 'goods-receipt', 'goods-receipt-items', 'product-stock', 'product-lots', 'supplier-order-card-lines', 'inventory-stock', 'purchase-delivery-comparison'].map(queryKey => cache.invalidateQueries({ queryKey: [queryKey] })));
    toast.success('Carico confermato: provenienze e giacenza aggiornate');
    onConfirmed?.();
  }, onError: (error: Error) => toast.error(error.message) });
  if (bundle.isPending) return <p className="text-sm text-muted-foreground">Caricamento ricezione…</p>;
  if (bundle.isError) return <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{bundle.error.message}</p><Button variant="outline" onClick={() => bundle.refetch()}>Riprova</Button></div>;
  if (done) return <section className="space-y-3"><p className="flex items-center gap-2 font-semibold"><PackageCheck className="size-5 text-success" />Carico confermato</p><Button onClick={onDone}>Visualizza ordine aggiornato</Button></section>;
  const doc = bundle.data?.incassiDocuments?.find(d => d.consegnaStato !== 'non_consegnato') ?? bundle.data?.incassiDocuments?.[0] ?? null;
  const docTitle = doc ? `DDT n. ${doc.docNumber?.trim() || '—'}${doc.docDate ? ` del ${itDate(doc.docDate)}` : ''}` : null;
  const subtitle = [orderNumber, supplierName].filter(Boolean).join(' · ');
  const unmatched = bundle.data?.incassiUnmatched ?? [];
  const extraLines = lines.filter(l => l.lineType === 'aggiunta_fornitore');
  const mainLines = lines.filter(l => l.lineType !== 'aggiunta_fornitore');
  const draftFor = (line: ReceiveLine) => drafts[line.key] ?? initialReceiveDraft(line, hasDelivery);
  const canConfirm = canConfirmReceipt(lines, drafts, reviewed, hasDelivery);
  const open = lines.find(l => l.key === openKey) ?? null;
  const pick = (line: ReceiveLine, outcome: ReceiveOutcome) => {
    const initial = initialReceiveDraft(line, hasDelivery);
    const current = draftFor(line);
    const next = outcome === 'ok' ? chooseOkDraft(line, current, hasDelivery) : chooseReceiveOutcome(line, current, outcome);
    setDrafts(prev => ({ ...prev, [line.key]: { ...(prev[line.key] ?? initial), ...next } }));
    setReviewed(prev => ({ ...prev, [line.key]: true }));
  };
  const row = (line: ReceiveLine) => {
    const indicator = receiveRowIndicator(line, draftFor(line), reviewed[line.key] ?? false);
    const hint = receiveRowHint(line);
    return <li key={line.key}><button type="button" onClick={() => setOpenKey(line.key)} className="grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left" aria-label={`${line.name}: ${indicator === 'ok' ? 'a posto' : 'da controllare'}`}>
      {indicator === 'ok' ? <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground" aria-hidden="true"><Check className="size-4" /></span>
        : <span className="size-7 shrink-0 rounded-full border-2 border-border" aria-hidden="true" />}
      <span className="min-w-0"><span className="block break-words font-semibold">{line.name}</span><span className="block text-xs text-muted-foreground">{requestedPreparedLabel(line)}</span>{indicator === 'da_controllare' && hint ? <span className="block text-xs font-medium text-foreground">{hint}</span> : null}</span>
      <span className="flex shrink-0 items-center gap-1">{indicator === 'da_controllare' ? <Badge variant="outline" className="border-warning bg-warning/15 text-xs text-foreground">Da confermare</Badge> : null}<ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" /></span>
    </button></li>;
  };
  return <section className="space-y-4 pb-4" aria-label="Ricezione merce">
    <header className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">Registra arrivo merce</p>
      <h3 className="break-words text-lg font-bold">{docTitle ?? (orderNumber || 'Ordine')}</h3>
      {docTitle && subtitle ? <p className="break-words text-xs text-muted-foreground">{subtitle}</p> : !docTitle && supplierName ? <p className="break-words text-xs text-muted-foreground">{supplierName}</p> : null}
    </header>
    {supplierDraft ? <p className="text-sm text-muted-foreground">Il fornitore sta ancora compilando la consegna. Attendi il suo dichiarato.</p> : null}
    <Button className="h-12 w-full font-semibold" disabled={confirm.isPending || supplierDraft || !lines.length} onClick={() => setDrafts(prev => confirmUntouched(lines, prev, hasDelivery))}><CheckCheck className="mr-2 size-4" />Segna OK tutte le righe</Button>
    {mainLines.length ? <ul {...listDrag} data-testid="receive-lines" className="max-h-[calc(100dvh-27rem)] min-h-40 cursor-grab touch-pan-y select-none divide-y divide-border overflow-y-auto overscroll-contain rounded-lg border border-border bg-card active:cursor-grabbing">{mainLines.map(row)}</ul> : null}
    {!lines.length ? <p className="text-sm text-muted-foreground">Nessun prodotto da ricevere.</p> : null}
    {unmatched.length || extraLines.length ? <Collapsible className="rounded-lg border border-border bg-card">
      <CollapsibleTrigger className="group flex min-h-12 w-full items-center justify-between gap-2 px-3 text-left text-sm font-medium">Altre righe del documento ({unmatched.length + extraLines.length})<ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" /></CollapsibleTrigger>
      <CollapsibleContent>
        {extraLines.length ? <><p className="px-3 pt-1 text-xs font-medium text-muted-foreground">Merce in più</p><ul className="divide-y divide-border">{extraLines.map(row)}</ul></> : null}
        {unmatched.length ? <><p className="px-3 pt-2 text-xs font-medium text-muted-foreground">Righe non abbinate all’ordine</p><ul className="space-y-1 px-3 pb-3 text-sm text-muted-foreground">{unmatched.map((l, i) => <li key={i} className="break-words">{l.code ?? '—'} {l.description ?? ''} · {l.qty ?? '—'} {l.um ?? ''}</li>)}</ul></> : null}
      </CollapsibleContent>
    </Collapsible> : null}
    <div className="sticky bottom-20 z-10 space-y-2 border-t border-border bg-background py-3 lg:bottom-2">
      <p className="text-sm">{receiveCountsLabel(lines, drafts, reviewed, hasDelivery)}</p>
      {receiveBlockingLabel(lines, drafts, reviewed, hasDelivery) ? <p className="text-xs font-medium">{receiveBlockingLabel(lines, drafts, reviewed, hasDelivery)}</p> : null}
      <Button className="h-12 w-full font-bold" disabled={confirm.isPending || supplierDraft || !canConfirm} onClick={() => confirm.mutate()}><PackageCheck className="mr-2 size-4" />{confirm.isPending ? 'Conferma in corso…' : 'Conferma carico'}</Button>
    </div>
    <Sheet open={Boolean(open)} onOpenChange={value => { if (!value) setOpenKey(null); }}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-xl p-4 pt-5">
        {open ? (() => {
          const line = open;
          const initial = initialReceiveDraft(line, hasDelivery);
          const draft = draftFor(line);
          const checked = draft.outcome;
          const money = receiveSheetMoney(line, draft);
          const details = openDetails[line.key] ?? false;
          const replacement = products.data?.find(p => p.id === draft.substituteProductId);
          const [requested, prepared] = requestedPreparedLabel(line).replace('Richiesto ', '').split(' · Preparato ');
          const set = (patch: Partial<ReceiveDraft>) => change(line.key, initial, patch);
          return <div className="space-y-3">
            <SheetHeader className="space-y-0.5 pr-8 text-left">
              <SheetDescription>{line.code}{docTitle ? ` · ${docTitle}` : ''}</SheetDescription>
              <SheetTitle className="break-words text-base">{line.name}</SheetTitle>
            </SheetHeader>
            <dl className="grid grid-cols-4 gap-1.5">
              {([['Richiesto', requested], ['Preparato', prepared], ['Prezzo', money.price ?? '—'], ['Importo', money.amount ?? '—']] as const).map(([label, value]) => <div key={label} className="min-w-0 rounded-md border border-border bg-muted/40 px-1.5 py-1"><dt className="text-[11px] text-muted-foreground">{label}</dt><dd className="break-words text-xs font-semibold leading-tight">{value}</dd></div>)}
            </dl>
            {isWeightLine(line) ? <p className="text-xs text-muted-foreground">Prodotto a peso: la quantità è quella pesata alla preparazione</p> : null}
            {receiveRowHint(line) ? <p className="text-xs font-medium">{receiveRowHint(line)?.replace(': tocca per confermare', ': scegli l’esito e controlla la quantità per il magazzino')}</p> : null}
            <div className="grid grid-cols-3 gap-2">
              {([['ok', 'OK'], ['parziale', 'Parziale'], ['mancante', 'Mancante']] as const).map(([value, label]) => {
                const active = value === 'ok' ? isOkOutcome(checked) : checked === value;
                return <Button key={value} className="h-12" variant={active ? 'default' : 'outline'} aria-pressed={active} disabled={confirm.isPending || supplierDraft} onClick={() => pick(line, value)}>{active ? <Check className="mr-1 size-4" /> : null}{label}</Button>;
              })}
            </div>
            <Button variant="link" className="h-11 px-0 text-sm" aria-pressed={checked === 'danneggiato'} disabled={confirm.isPending || supplierDraft} onClick={() => pick(line, 'danneggiato')}>Altro: contesta</Button>
            <div className="grid gap-3">
              {checked === 'parziale' || checked === 'danneggiato' ? <label className="text-xs text-muted-foreground">Quantità arrivata ({line.unitCode})<Input className="mt-1 h-11" inputMode="decimal" value={draft.quantity} disabled={confirm.isPending} onChange={e => set({ quantity: e.target.value })} /></label> : null}
              {checked === 'danneggiato' ? <><label className="text-xs text-muted-foreground">Quantità buona ({line.unitCode})<Input className="mt-1 h-11" inputMode="decimal" value={draft.goodQuantity} disabled={confirm.isPending} onChange={e => set({ goodQuantity: e.target.value })} /></label><label className="text-xs text-muted-foreground">Motivo<Select value={draft.reason} onValueChange={value => set({ reason: value as DisputeReason })} disabled={confirm.isPending}><SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DISPUTE_REASON_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label></> : null}
              {checked === 'mancante' ? <label className="text-xs text-muted-foreground">Motivo della mancanza<Input className="mt-1 h-11" value={draft.missingReason} disabled={confirm.isPending} onChange={e => set({ missingReason: e.target.value })} /></label> : null}
              {!line.sameUnit && checked && checked !== 'mancante' ? <><label className="text-xs text-muted-foreground">Quantità effettiva arrivata ({line.stockUnitCode ?? 'U.M. magazzino'})<Input className="mt-1 h-11" inputMode="decimal" value={draft.stockQuantity} disabled={confirm.isPending} onChange={e => set({ stockQuantity: e.target.value })} /></label>{checked === 'danneggiato' ? <label className="text-xs text-muted-foreground">Quantità buona ({line.stockUnitCode ?? 'U.M. magazzino'})<Input className="mt-1 h-11" inputMode="decimal" value={draft.goodStockQuantity} disabled={confirm.isPending} onChange={e => set({ goodStockQuantity: e.target.value })} /></label> : null}</> : null}
            </div>
            <Button variant="ghost" className="h-11" aria-expanded={details} onClick={() => setOpenDetails(prev => ({ ...prev, [line.key]: !details }))}><ChevronRight className={`mr-1 size-4 transition-transform ${details ? 'rotate-90' : ''}`} />Dettagli riga</Button>
            {details ? <div className="grid gap-3">
              {([['producer', 'Produttore'], ['lot', 'Lotto'], ['expiry', 'Scadenza'], ['unitCost', 'Prezzo'], ['priceUnitCode', 'U.M. del prezzo'], ['priceQuantity', 'Quantità del prezzo']] as const).map(([field, label]) => <label key={field} className="text-xs text-muted-foreground">{label}<Input className="mt-1 h-11" type={field === 'expiry' ? 'date' : 'text'} inputMode={field === 'unitCost' || field === 'priceQuantity' ? 'decimal' : 'text'} value={checked === 'eccedenza' && field === 'priceQuantity' ? draft.quantity : draft[field]} disabled={confirm.isPending || (checked === 'eccedenza' && (field === 'unitCost' || field === 'priceUnitCode' || field === 'priceQuantity'))} list={field === 'priceUnitCode' ? `receive-price-units-${line.key}` : undefined} onChange={e => set({ [field]: e.target.value })} /></label>)}
              <datalist id={`receive-price-units-${line.key}`}>{(units.data ?? []).map(unit => <option key={unit.id} value={unit.code} />)}</datalist>
              {!frozenDeclaration && checked === 'mancante' ? <><label className="text-xs text-muted-foreground">Prodotto sostitutivo<Select value={draft.substituteProductId || 'none'} disabled={confirm.isPending} onValueChange={value => set({ substituteProductId: value === 'none' ? '' : value })}><SelectTrigger className="mt-1 h-11"><SelectValue placeholder="Nessuno" /></SelectTrigger><SelectContent><SelectItem value="none">Nessuno</SelectItem>{(products.data ?? []).filter(p => p.stock_unit_id && p.id !== line.productId).map(p => <SelectItem key={p.id} value={p.id}>{p.code} · {p.description}</SelectItem>)}</SelectContent></Select></label>{draft.substituteProductId ? <label className="text-xs text-muted-foreground">Quantità sostitutiva ({replacement?.units_of_measure?.code ?? 'U.M. magazzino'})<Input className="mt-1 h-11" inputMode="decimal" value={draft.substituteQuantity} disabled={confirm.isPending} onChange={e => set({ substituteQuantity: e.target.value })} /></label> : null}</> : null}
            </div> : null}
            <Button className="h-12 w-full" variant="secondary" onClick={() => setOpenKey(null)}>Fatto</Button>
          </div>;
        })() : null}
      </SheetContent>
    </Sheet>
  </section>;
}
