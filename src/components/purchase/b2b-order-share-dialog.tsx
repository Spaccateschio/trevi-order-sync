import { Copy, Mail, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { b2bOrderShareUrl, b2bShareHref } from '@/lib/b2b-order-sharing';

export function B2bOrderShareDialog({ orderId, number, supplier, onClose }: { orderId: string; number: string; supplier: string; onClose: () => void }) {
  const url = b2bOrderShareUrl(window.location.origin, orderId);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Rimanda ordine {number}</DialogTitle><DialogDescription>{supplier}</DialogDescription></DialogHeader>
      <Label htmlFor="b2b-order-link">Link dell'ordine</Label>
      <Input id="b2b-order-link" readOnly value={url} onFocus={event => event.target.select()} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(url); toast.success('Link copiato'); } catch { toast.error('Copia non riuscita'); } }}><Copy className="size-4" /> Copia link</Button>
        <Button variant="outline" asChild><a href={b2bShareHref('whatsapp', url, number)} target="_blank" rel="noopener noreferrer"><MessageSquare className="size-4" /> Condividi su WhatsApp</a></Button>
        <Button variant="outline" asChild><a href={b2bShareHref('email', url, number)}><Mail className="size-4" /> Invia tramite Email</a></Button>
      </div>
      <Button variant="outline" onClick={onClose}>Chiudi</Button>
    </DialogContent>
  </Dialog>;
}