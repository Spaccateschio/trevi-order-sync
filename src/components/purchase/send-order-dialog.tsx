import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PriceInfoNotice } from "@/components/pricing/price-info-notice";

export type SendChannel = "whatsapp" | "email" | "sms" | "telefono" | "di_persona" | "altro";

export const SEND_CHANNELS: { value: SendChannel; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "telefono", label: "Telefono" },
  { value: "di_persona", label: "Di persona" },
  { value: "altro", label: "Altro" },
];

/**
 * Conferma d'invio. B2B: l'ordine arriva al fornitore tramite la piattaforma.
 * Non B2B: l'operatore conferma di averlo inviato e indica il canale (obbligatorio anche nel database).
 */
export function SendOrderDialog({
  open,
  onOpenChange,
  isB2b,
  supplierName,
  orderNumber,
  pending,
  onConfirm,
  sellerCompanyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isB2b: boolean;
  supplierName: string | null;
  orderNumber: string | null;
  pending: boolean;
  onConfirm: (channel: SendChannel | null) => void;
  /** Fornitore B2B: mostra l'avviso sui prezzi indicativi prima dell'invio definitivo. */
  sellerCompanyId?: string | null;
}) {
  const [channel, setChannel] = useState<SendChannel | "">("");
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) { onOpenChange(next); if (!next) setChannel(""); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Invia ordine {orderNumber ?? ""}</DialogTitle>
          <DialogDescription>
            {isB2b
              ? `L'ordine arriva subito a ${supplierName ?? "il fornitore"} tramite la piattaforma. Dopo l'invio non è più una bozza.`
              : `Conferma di aver inviato l'ordine a ${supplierName ?? "il fornitore"} e indica come. Dopo l'invio non è più una bozza.`}
          </DialogDescription>
        </DialogHeader>
        {isB2b && sellerCompanyId ? <PriceInfoNotice sellerCompanyId={sellerCompanyId} /> : null}
        {!isB2b ? (
          <RadioGroup value={channel} onValueChange={(v) => setChannel(v as SendChannel)} className="grid grid-cols-2 gap-2">
            {SEND_CHANNELS.map((c) => (
              <Label key={c.value} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-normal">
                <RadioGroupItem value={c.value} /> {c.label}
              </Label>
            ))}
          </RadioGroup>
        ) : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button
            disabled={pending || (!isB2b && !channel)}
            onClick={() => onConfirm(isB2b ? null : (channel as SendChannel))}
          >
            {isB2b ? "Invia tramite piattaforma" : "Confermo: ordine inviato"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
