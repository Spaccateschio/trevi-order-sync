import { useMutation, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Link2, Printer, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { confirmNonB2bOrderShare, createOrderShareLink } from '@/lib/purchase.functions';
import { SHARE_CHANNELS, shareHref, shareRecipientError, type ShareChannel } from '@/lib/order-sharing';
import { orderShareText } from '@/components/shopping/generation-results';
import { normalizeOrderShareLink, orderShareUrl } from '@/lib/order-share-url';

type Link = { url: string; expiresAt: string };
export function OrderShareDialog({ orderId, mode = 'first', onClose, onConfirmed, initialLink = null, onLink }: { orderId: string; mode?: 'first' | 'resend'; onClose: () => void; onConfirmed: (closed: boolean) => void | Promise<void>; initialLink?: Link | null; onLink?: (link: Link) => void }) {
  const [channel, setChannel] = useState<ShareChannel>('email');
  const [emailEdit, setEmailEdit] = useState<string | null>(null);
  const [phoneEdit, setPhoneEdit] = useState<string | null>(null);
  const [performed, setPerformed] = useState(false);
  const [link, setLink] = useState<Link | null>(initialLink);
  const key = useRef<string | null>(null);
  const confirm = useServerFn(confirmNonB2bOrderShare);
  const makeLink = useServerFn(createOrderShareLink);
  const data = useQuery({ queryKey: ['order-share-preview', orderId], queryFn: async () => {
    const { data: order, error } = await supabase.from('purchase_orders').select('number, company_id, supplier_record_id, delivery_date, delivery_time_from, delivery_time_to, delivery_address_text, supplier_notes').eq('id', orderId).single();
    if (error) throw new Error(error.message);
    const [supplier, lines, links, buyer] = await Promise.all([
      supabase.from('supplier_records').select('legal_name,email,phone').eq('id', order.supplier_record_id).single(),
      supabase.from('purchase_order_items').select('product_name,product_code,supplier_product_code,purchase_quantity,purchase_unit_code,notes').eq('order_id', orderId).order('created_at'),
      supabase.from('purchase_order_share_links').select('expires_at').eq('order_id', orderId).is('revoked_at',null).gt('expires_at',new Date().toISOString()),
      supabase.from('companies').select('legal_name,logo_url,address_line,postal_code,city,province,vat_number,phone,email').eq('id', order.company_id).maybeSingle(),
    ]);
    if (supplier.error) throw new Error(supplier.error.message);
    if (lines.error) throw new Error(lines.error.message);
    if (links.error) throw new Error(links.error.message);
    return { order, supplier: supplier.data, lines: lines.data ?? [], links: links.data ?? [], buyer: buyer.data ?? null };
  }});
  const d = data.data;
  const email = emailEdit ?? d?.supplier.email ?? '';
  const phone = phoneEdit ?? d?.supplier.phone ?? '';
  const recipient = channel === 'email' ? email : ['whatsapp','sms','telefono'].includes(channel) ? phone : '';
  const validLink = link && new Date(link.expiresAt).getTime() > Date.now() ? normalizeOrderShareLink(link) : null;
  const text = d ? orderShareText(d.order.number, d.supplier.legal_name, d.lines, validLink?.url ?? '', { date: d.order.delivery_date, from: d.order.delivery_time_from, to: d.order.delivery_time_to, address: d.order.delivery_address_text, notes: d.order.supplier_notes, lineNotes: d.lines.filter(l => l.notes?.trim()).map(l => `${l.product_name ?? ''}: ${l.notes}`) }) : '';
  const share = useMutation({ mutationFn: () => makeLink({ data: { orderId, recipientLabel: d?.supplier.legal_name ?? null, validHours: 72, keepExisting: true } }), onSuccess: result => { const next = { url: orderShareUrl(result.token), expiresAt: result.expiresAt }; setLink(next); onLink?.(next); setPerformed(false); }, onError: (e: Error) => toast.error(e.message) });
  const save = useMutation({ mutationFn: () => { const error = shareRecipientError(channel,recipient); if(error) throw new Error(error); key.current ??= crypto.randomUUID(); return confirm({ data: { orderId, mode, channel, recipient: recipient.trim() || null, key: key.current } }); }, onSuccess: async result => { await onConfirmed(result.list_closed); onClose(); toast.success(mode==='resend' ? 'Reinvio confermato' : 'Ordine confermato come inviato'); }, onError: (e: Error) => toast.error(e.message) });
  const launch = async () => {
    const error = shareRecipientError(channel,recipient); if (error) { toast.error(error); return; }
    if(channel==='copia_testo') { try { await navigator.clipboard.writeText(text); setPerformed(true); toast.success('Testo copiato'); } catch { toast.error('Copia non riuscita'); } return; }
    const href = shareHref(channel,recipient,d?.order.number ?? null,text);
    if(href) { if(channel==='whatsapp') window.open(href,'_blank','noopener,noreferrer'); else window.location.href=href; }
    setPerformed(true);
  };
  // Foglio d'ordine stampabile: intestazione di chi ordina, prodotti e colonne vuote da compilare a mano.
  const print = () => {
    if (!d) return;
    const popup = window.open('', '_blank', 'width=1000,height=900');
    if (!popup) { toast.error('Consenti le finestre popup per stampare o salvare il PDF'); return; }
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const b = d.buyer;
    const buyerAddress = b ? [b.address_line, [b.postal_code, b.city, b.province ? `(${b.province})` : ''].filter(Boolean).join(' ')].filter(Boolean).join(' — ') : '';
    const time = (t: string | null) => t ? t.slice(0, 5) : '';
    const date = d.order.delivery_date ? new Date(`${d.order.delivery_date}T00:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    const rows = d.lines.map((l) => `<tr><td>${esc(l.supplier_product_code || l.product_code)}</td><td><b>${esc(l.product_name)}</b>${l.notes ? `<div class="n">${esc(l.notes)}</div>` : ''}</td><td class="r">${esc(l.purchase_quantity)}</td><td>${esc(l.purchase_unit_code)}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
    popup.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Ordine ${esc(d.order.number)}</title><style>
      @page{size:A4 landscape;margin:12mm}body{font:12px/1.4 Arial,sans-serif;color:#111;margin:0}
      header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px}
      .buyer{display:flex;gap:12px;align-items:center}.buyer img{max-height:60px;max-width:160px;object-fit:contain}
      h1{font-size:18px;margin:0}h2{font-size:14px;margin:0 0 4px}.muted{color:#555}
      .box{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}.box div{border:1px solid #999;padding:8px;border-radius:4px}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:6px;vertical-align:top}th{background:#eee;text-align:left;font-size:11px}
      td{height:22px}.r{text-align:right}.n{font-size:11px;color:#555}.sign{display:flex;justify-content:space-between;margin-top:28px}.sign span{border-top:1px solid #111;width:40%;padding-top:4px;text-align:center}
    </style></head><body>
      <header><div class="buyer">${b?.logo_url ? `<img src="${esc(b.logo_url)}" alt="">` : ''}<div><h2>${esc(b?.legal_name)}</h2><div class="muted">${esc(buyerAddress)}</div><div class="muted">${[b?.vat_number ? `P.IVA ${esc(b.vat_number)}` : '', b?.phone ? `Tel. ${esc(b.phone)}` : '', esc(b?.email)].filter(Boolean).join(' · ')}</div></div></div>
      <div style="text-align:right"><h1>Ordine ${esc(d.order.number)}</h1><div class="muted">Stampato il ${new Date().toLocaleDateString('it-IT')}</div></div></header>
      <div class="box"><div><b>Fornitore</b><br>${esc(d.supplier.legal_name)}</div><div><b>Consegna</b><br>${esc(date)}${d.order.delivery_time_from ? ` · ${time(d.order.delivery_time_from)}–${time(d.order.delivery_time_to)}` : ''}<br>${esc(d.order.delivery_address_text)}</div></div>
      ${d.order.supplier_notes ? `<p><b>Note:</b> ${esc(d.order.supplier_notes)}</p>` : ''}
      <table><thead><tr><th>Codice</th><th>Prodotto</th><th>Q.tà ordinata</th><th>U.M.</th><th>Q.tà consegnata</th><th>Peso lordo</th><th>Tara</th><th>Peso netto</th><th>Prezzo</th><th>Note fornitore</th></tr></thead><tbody>${rows}</tbody></table>
      ${validLink ? `<p style="margin-top:12px">Compila online pesi, prezzi e tare: <b>${esc(validLink.url)}</b></p>` : ''}
      <div class="sign"><span>Firma fornitore</span><span>Firma ricevente</span></div>
    </body></html>`);
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 400);
  };
  return <Dialog open onOpenChange={next => { if(!next && !save.isPending && !share.isPending) onClose(); }}><DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{mode==='resend'?'Rimanda ordine':'Invia ordine'} {d?.order.number}</DialogTitle><DialogDescription>{d?.supplier.legal_name ?? 'Fornitore'}</DialogDescription></DialogHeader>
    {data.isPending ? <p>Caricamento…</p> : data.isError ? <p className="text-destructive">{data.error.message}</p> : <>
      <Label>Canale<Select value={channel} onValueChange={v=>{setChannel(v as ShareChannel);setPerformed(false);}} disabled={save.isPending}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SHARE_CHANNELS.map(c=><SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></Label>
      {channel==='email' ? <Label>Email destinatario<Input value={email} type="email" disabled={save.isPending} onChange={e=>{setEmailEdit(e.target.value);setPerformed(false);}} /></Label> : ['whatsapp','sms','telefono'].includes(channel) ? <Label>Telefono destinatario<Input value={phone} type="tel" disabled={save.isPending} onChange={e=>{setPhoneEdit(e.target.value);setPerformed(false);}} /></Label> : null}
      <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words border border-border rounded-md bg-muted p-3 text-sm font-sans">{text}</pre>
      {validLink ? <div className="text-xs space-y-2"><p>Link valido fino al {new Date(validLink.expiresAt).toLocaleString('it-IT')}</p><Button variant="outline" size="sm" onClick={async()=>{try { await navigator.clipboard.writeText(validLink.url); if (channel==='email') setChannel('altro'); setPerformed(true); toast.success('Link copiato: ora puoi confermare l’invio'); } catch {toast.error('Copia non riuscita');}}}><Copy className="size-4" /> Copia link</Button></div> : <div className="space-y-2 text-xs">{Boolean(d?.links.length) && <p>Esiste già un link valido. L’indirizzo non è recuperabile; un link aggiuntivo non revoca il precedente.</p>}<Button variant="outline" size="sm" disabled={share.isPending || save.isPending} onClick={()=>share.mutate()}><Link2 className="size-4" /> {d?.links.length ? 'Crea link aggiuntivo per condividere' : 'Crea link per condividere'}</Button></div>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={save.isPending || share.isPending} onClick={()=>void launch()}><Send className="size-4" /> {channel==='copia_testo'?'Copia testo': ['telefono','di_persona','altro'].includes(channel)?'Ho comunicato l’ordine':`Apri ${SHARE_CHANNELS.find(c=>c.value===channel)?.label}`}</Button><Button variant="outline" disabled={save.isPending || share.isPending} onClick={print}><Printer className="size-4" /> Stampa / PDF</Button></div>
      <p className="text-xs text-muted-foreground">La conferma è una dichiarazione manuale, non una prova di consegna o lettura.</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={save.isPending || share.isPending} onClick={onClose}>Chiudi</Button><Button disabled={!performed || save.isPending || share.isPending} onClick={()=>save.mutate()}>Confermo: ordine inviato</Button></div>
    </>}
  </DialogContent></Dialog>;
}
