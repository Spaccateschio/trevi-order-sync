import { useMutation, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Link2, Send } from 'lucide-react';
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
    const { data: order, error } = await supabase.from('purchase_orders').select('number, supplier_record_id, delivery_date, delivery_time_from, delivery_time_to, delivery_address_text, supplier_notes').eq('id', orderId).single();
    if (error) throw new Error(error.message);
    const [supplier, lines, links] = await Promise.all([
      supabase.from('supplier_records').select('legal_name,email,phone').eq('id', order.supplier_record_id).single(),
      supabase.from('purchase_order_items').select('product_name,product_code,supplier_product_code,purchase_quantity,purchase_unit_code,notes').eq('order_id', orderId).order('created_at'),
      supabase.from('purchase_order_share_links').select('expires_at').eq('order_id', orderId).is('revoked_at',null).gt('expires_at',new Date().toISOString()),
    ]);
    if (supplier.error) throw new Error(supplier.error.message);
    if (lines.error) throw new Error(lines.error.message);
    if (links.error) throw new Error(links.error.message);
    return { order, supplier: supplier.data, lines: lines.data ?? [], links: links.data ?? [] };
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
  return <Dialog open onOpenChange={next => { if(!next && !save.isPending && !share.isPending) onClose(); }}><DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{mode==='resend'?'Rimanda ordine':'Invia ordine'} {d?.order.number}</DialogTitle><DialogDescription>{d?.supplier.legal_name ?? 'Fornitore'}</DialogDescription></DialogHeader>
    {data.isPending ? <p>Caricamento…</p> : data.isError ? <p className="text-destructive">{data.error.message}</p> : <>
      <Label>Canale<Select value={channel} onValueChange={v=>{setChannel(v as ShareChannel);setPerformed(false);}} disabled={save.isPending}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SHARE_CHANNELS.map(c=><SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></Label>
      {channel==='email' ? <Label>Email destinatario<Input value={email} type="email" disabled={save.isPending} onChange={e=>{setEmailEdit(e.target.value);setPerformed(false);}} /></Label> : ['whatsapp','sms','telefono'].includes(channel) ? <Label>Telefono destinatario<Input value={phone} type="tel" disabled={save.isPending} onChange={e=>{setPhoneEdit(e.target.value);setPerformed(false);}} /></Label> : null}
      <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words border border-border rounded-md bg-muted p-3 text-sm font-sans">{text}</pre>
      {validLink ? <div className="text-xs space-y-2"><p>Link valido fino al {new Date(validLink.expiresAt).toLocaleString('it-IT')}</p><Button variant="outline" size="sm" onClick={async()=>{try { await navigator.clipboard.writeText(validLink.url); if (channel==='email') setChannel('altro'); setPerformed(true); toast.success('Link copiato: ora puoi confermare l’invio'); } catch {toast.error('Copia non riuscita');}}}><Copy className="size-4" /> Copia link</Button></div> : <div className="space-y-2 text-xs">{Boolean(d?.links.length) && <p>Esiste già un link valido. L’indirizzo non è recuperabile; un link aggiuntivo non revoca il precedente.</p>}<Button variant="outline" size="sm" disabled={share.isPending || save.isPending} onClick={()=>share.mutate()}><Link2 className="size-4" /> {d?.links.length ? 'Crea link aggiuntivo per condividere' : 'Crea link per condividere'}</Button></div>}
      <Button variant="outline" disabled={save.isPending || share.isPending} onClick={()=>void launch()}><Send className="size-4" /> {channel==='copia_testo'?'Copia testo': ['telefono','di_persona','altro'].includes(channel)?'Ho comunicato l’ordine':`Apri ${SHARE_CHANNELS.find(c=>c.value===channel)?.label}`}</Button>
      <p className="text-xs text-muted-foreground">La conferma è una dichiarazione manuale, non una prova di consegna o lettura.</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={save.isPending || share.isPending} onClick={onClose}>Chiudi</Button><Button disabled={!performed || save.isPending || share.isPending} onClick={()=>save.mutate()}>Confermo: ordine inviato</Button></div>
    </>}
  </DialogContent></Dialog>;
}
