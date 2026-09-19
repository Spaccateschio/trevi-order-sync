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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

/**
 * Punti operativi del fornitore: sede, magazzino e punti di ritiro.
 * Stessa struttura dei punti operativi del cliente: la funzione è esplicita,
 * così un futuro ordine sa quale indirizzo proporre senza reinterpretazioni.
 */
type PointFunction = "sede_legale" | "sede_operativa" | "consegna" | "ritiro" | "magazzino";

const FUNCTIONS: { code: PointFunction; label: string }[] = [
  { code: "ritiro", label: "Punto di ritiro" },
  { code: "magazzino", label: "Magazzino" },
  { code: "sede_operativa", label: "Sede operativa" },
  { code: "sede_legale", label: "Sede legale" },
  { code: "consegna", label: "Consegna merce" },
];

type PointRow = {
  id: string;
  label: string;
  function: PointFunction;
  internal_code: string | null;
  danea_reference: string | null;
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
  is_default: boolean;
  status: "attivo" | "disattivato" | "revocato";
  address_id: string | null;
};

type AddressOption = { id: string; label: string; city: string | null };

const emptyForm = {
  label: "",
  function: "ritiro" as PointFunction,
  internal_code: "",
  danea_reference: "",
  contact_name: "",
  phone: "",
  notes: "",
  address_id: "",
};

const NO_ADDRESS = "__nessuno__";

export function SupplierPointsManager({
  supplierRecordId,
  isAdmin,
}: {
  supplierRecordId: string;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["supplier-points", supplierRecordId] as const;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PointRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const pointsQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<PointRow[]> => {
      const { data, error } = await supabase
        .from("customer_destinations")
        .select(
          "id, label, function, internal_code, danea_reference, contact_name, phone, notes, is_default, status, address_id",
        )
        .eq("supplier_record_id", supplierRecordId)
        .order("label");
      if (error) throw error;
      return (data ?? []) as PointRow[];
    },
  });

  const addressesQuery = useQuery({
    queryKey: ["addresses", "supplier_record_id", supplierRecordId],
    queryFn: async (): Promise<AddressOption[]> => {
      const { data, error } = await supabase
        .from("addresses")
        .select("id, label, city")
        .eq("supplier_record_id", supplierRecordId)
        .order("label");
      if (error) throw error;
      return (data ?? []) as AddressOption[];
    },
  });

  const points = pointsQuery.data ?? [];
  const addresses = addressesQuery.data ?? [];

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(row: PointRow) {
    setEditing(row);
    setForm({
      label: row.label,
      function: row.function,
      internal_code: row.internal_code ?? "",
      danea_reference: row.danea_reference ?? "",
      contact_name: row.contact_name ?? "",
      phone: row.phone ?? "",
      notes: row.notes ?? "",
      address_id: row.address_id ?? "",
    });
    setOpen(true);
  }

  async function call(action: string, extra: Record<string, unknown> = {}) {
    const { error } = await supabase.rpc("manage_supplier_destination", {
      _supplier_record_id: supplierRecordId,
      _action: action,
      ...extra,
    });
    if (error) {
      toast.error(error.message);
      return false;
    }
    await queryClient.invalidateQueries({ queryKey });
    return true;
  }

  async function save() {
    if (!form.label.trim()) {
      toast.error("Indica un nome per questo punto operativo");
      return;
    }
    setBusy(true);
    const ok = await call(editing ? "update" : "create", {
      ...(editing ? { _destination_id: editing.id } : {}),
      _label: form.label.trim(),
      _function: form.function,
      _internal_code: form.internal_code,
      _danea_reference: form.danea_reference,
      _contact_name: form.contact_name,
      _phone: form.phone,
      _notes: form.notes,
      ...(form.address_id ? { _address_id: form.address_id } : {}),
    });
    setBusy(false);
    if (!ok) return;
    setOpen(false);
    toast.success(editing ? "Punto operativo aggiornato." : "Punto operativo aggiunto.");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Punti operativi</p>
          <p className="text-xs text-muted-foreground">
            Sede, magazzini e punti di ritiro del fornitore: ogni punto ha la sua funzione.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={!isAdmin} onClick={openNew}>
          Nuovo punto
        </Button>
      </div>

      {!points.length ? (
        <p className="text-xs text-muted-foreground">
          Nessun punto operativo: aggiungi il primo (per esempio il magazzino di ritiro).
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {points.map((point) => (
            <div key={point.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {point.label}
                  {point.is_default ? " · predefinito" : ""}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[
                    FUNCTIONS.find((f) => f.code === point.function)?.label ?? point.function,
                    point.internal_code,
                    point.contact_name,
                    point.status === "attivo" ? null : "disattivato",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={!isAdmin}
                  onClick={() => openEdit(point)}
                >
                  Modifica
                </Button>
                {point.is_default ? null : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={!isAdmin}
                    onClick={() => void call("set_default", { _destination_id: point.id })}
                  >
                    Predefinito
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={!isAdmin}
                  onClick={() =>
                    void call(point.status === "attivo" ? "deactivate" : "activate", {
                      _destination_id: point.id,
                    })
                  }
                >
                  {point.status === "attivo" ? "Disattiva" : "Riattiva"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Punto operativo" : "Nuovo punto operativo"}</DialogTitle>
            <DialogDescription>
              La funzione dice a cosa serve questo indirizzo: ritiro, magazzino, sede o consegna.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Nome</Label>
              <Input
                value={form.label}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
                placeholder="Es. Magazzino Guidonia"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Funzione</Label>
              <Select
                value={form.function}
                onValueChange={(value) => setForm({ ...form, function: value as PointFunction })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUNCTIONS.map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Indirizzo collegato</Label>
              <Select
                value={form.address_id || NO_ADDRESS}
                onValueChange={(value) =>
                  setForm({ ...form, address_id: value === NO_ADDRESS ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nessuno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ADDRESS}>Nessuno</SelectItem>
                  {addresses.map((address) => (
                    <SelectItem key={address.id} value={address.id}>
                      {address.label}
                      {address.city ? ` · ${address.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Codice interno</Label>
              <Input
                value={form.internal_code}
                onChange={(event) => setForm({ ...form, internal_code: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Riferimento Danea</Label>
              <Input
                value={form.danea_reference}
                onChange={(event) => setForm({ ...form, danea_reference: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Referente</Label>
              <Input
                value={form.contact_name}
                onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Telefono</Label>
              <Input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Note</Label>
              <Textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
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
