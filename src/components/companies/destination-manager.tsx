import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

/**
 * Destinazioni del cliente: punti operativi della stessa ragione sociale.
 * Ogni destinazione può richiedere documenti separati e collega un indirizzo
 * già presente nella scheda cliente, senza duplicare l'anagrafica.
 */
type DestinationRow = {
  id: string;
  label: string;
  internal_code: string | null;
  danea_reference: string | null;
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
  separate_documents: boolean;
  is_default: boolean;
  status: "attivo" | "disattivato" | "revocato";
  address_id: string | null;
};

type AddressOption = { id: string; label: string; city: string | null };

const emptyForm = {
  label: "",
  internal_code: "",
  danea_reference: "",
  contact_name: "",
  phone: "",
  notes: "",
  separate_documents: false,
  address_id: "",
};

type FormState = typeof emptyForm;

const NO_ADDRESS = "__nessuno__";

export function DestinationManager({
  customerRecordId,
  isAdmin,
}: {
  customerRecordId: string;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["customer-destinations", customerRecordId] as const;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DestinationRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);

  const destinationsQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<DestinationRow[]> => {
      const { data, error } = await supabase
        .from("customer_destinations")
        .select(
          "id, label, internal_code, danea_reference, contact_name, phone, notes, separate_documents, is_default, status, address_id",
        )
        .eq("customer_record_id", customerRecordId)
        .order("label");
      if (error) throw error;
      return (data ?? []) as DestinationRow[];
    },
  });

  const addressesQuery = useQuery({
    queryKey: ["customer-destination-addresses", customerRecordId],
    queryFn: async (): Promise<AddressOption[]> => {
      const { data, error } = await supabase
        .from("addresses")
        .select("id, label, city")
        .eq("customer_record_id", customerRecordId)
        .order("label");
      if (error) throw error;
      return (data ?? []) as AddressOption[];
    },
  });

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(row: DestinationRow) {
    setEditing(row);
    setForm({
      label: row.label,
      internal_code: row.internal_code ?? "",
      danea_reference: row.danea_reference ?? "",
      contact_name: row.contact_name ?? "",
      phone: row.phone ?? "",
      notes: row.notes ?? "",
      separate_documents: row.separate_documents,
      address_id: row.address_id ?? "",
    });
    setOpen(true);
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey });
  }

  async function save() {
    if (!form.label.trim()) {
      toast.error("Indica un nome per la destinazione");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("manage_customer_destination", {
      _customer_record_id: customerRecordId,
      _action: editing ? "update" : "create",
      ...(editing ? { _destination_id: editing.id } : {}),
      _label: form.label,
      ...(form.address_id ? { _address_id: form.address_id } : {}),
      _internal_code: form.internal_code,
      _danea_reference: form.danea_reference,
      _contact_name: form.contact_name,
      _phone: form.phone,
      _notes: form.notes,
      _separate_documents: form.separate_documents,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOpen(false);
    await refresh();
    toast.success(editing ? "Destinazione aggiornata." : "Destinazione aggiunta.");
  }

  async function act(row: DestinationRow, action: "activate" | "deactivate" | "set_default") {
    const { error } = await supabase.rpc("manage_customer_destination", {
      _customer_record_id: customerRecordId,
      _destination_id: row.id,
      _action: action,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
  }

  const rows = destinationsQuery.data ?? [];
  const addresses = addressesQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Destinazioni
        </h3>
        <Button size="sm" variant="outline" disabled={!isAdmin} onClick={openNew}>
          Aggiungi destinazione
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Stessa ragione sociale, più punti operativi: ognuno può avere consegne e documenti propri.
      </p>

      {destinationsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : rows.length ? (
        <ul className="space-y-2">
          {rows.map((row) => {
            const address = addresses.find((a) => a.id === row.address_id);
            return (
              <li
                key={row.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {row.label}
                    {row.is_default ? " ★" : ""}
                    {row.status === "attivo" ? "" : " · non attiva"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {address
                      ? [address.label, address.city].filter(Boolean).join(" · ")
                      : "Indirizzo da collegare"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      row.internal_code ? `Codice ${row.internal_code}` : null,
                      row.danea_reference ? `Danea ${row.danea_reference}` : null,
                      row.separate_documents ? "documenti separati" : "documenti unici",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => openEdit(row)}>
                    Modifica
                  </Button>
                  {row.is_default || row.status !== "attivo" ? null : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!isAdmin}
                      onClick={() => act(row, "set_default")}
                    >
                      Predefinita
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!isAdmin}
                    onClick={() => act(row, row.status === "attivo" ? "deactivate" : "activate")}
                  >
                    {row.status === "attivo" ? "Disattiva" : "Riattiva"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nessuna destinazione: aggiungi il punto operativo dove consegni la merce.
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica destinazione" : "Nuova destinazione"}</DialogTitle>
            <DialogDescription>
              La destinazione appartiene a questo cliente e riusa uno degli indirizzi già inseriti.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="dest-label">Nome destinazione</Label>
              <Input
                id="dest-label"
                value={form.label}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Indirizzo collegato</Label>
              <Select
                value={form.address_id || NO_ADDRESS}
                onValueChange={(value) =>
                  setForm({ ...form, address_id: value === NO_ADDRESS ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Scegli un indirizzo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ADDRESS}>Nessun indirizzo</SelectItem>
                  {addresses.map((address) => (
                    <SelectItem key={address.id} value={address.id}>
                      {[address.label, address.city].filter(Boolean).join(" · ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dest-code">Codice interno</Label>
              <Input
                id="dest-code"
                value={form.internal_code}
                onChange={(event) => setForm({ ...form, internal_code: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dest-danea">Riferimento Danea</Label>
              <Input
                id="dest-danea"
                value={form.danea_reference}
                onChange={(event) => setForm({ ...form, danea_reference: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dest-contact">Referente</Label>
              <Input
                id="dest-contact"
                value={form.contact_name}
                onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dest-phone">Telefono</Label>
              <Input
                id="dest-phone"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="dest-notes">Note operative</Label>
              <Textarea
                id="dest-notes"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Documenti separati</p>
              <p className="text-xs text-muted-foreground">
                Attiva se questa destinazione richiede ordini e documenti propri, distinti dalle
                altre destinazioni dello stesso cliente.
              </p>
            </div>
            <Switch
              checked={form.separate_documents}
              onCheckedChange={(value) => setForm({ ...form, separate_documents: value })}
              aria-label="Documenti separati"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Chiudi
            </Button>
            <Button disabled={busy || !isAdmin} onClick={save}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
