import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

/**
 * Indirizzi multipli: un elenco per azienda o per scheda cliente.
 * Le funzioni (sede legale, consegna, ritiro…) sono separate dall'indirizzo,
 * così lo stesso luogo può servire a più scopi senza essere duplicato.
 * La visibilità verso i partner è un interruttore esplicito, distinto dal predefinito.
 */
export type AddressFunctionCode =
  | "sede_legale"
  | "sede_operativa"
  | "consegna"
  | "ritiro"
  | "magazzino";

export const ADDRESS_FUNCTIONS: { code: AddressFunctionCode; label: string }[] = [
  { code: "sede_legale", label: "Sede legale" },
  { code: "sede_operativa", label: "Sede operativa" },
  { code: "consegna", label: "Consegna merce" },
  { code: "ritiro", label: "Ritiro merce" },
  { code: "magazzino", label: "Magazzino" },
];

type AddressFunctionRow = {
  id: string;
  function: AddressFunctionCode;
  is_default: boolean;
};

type AddressRow = {
  id: string;
  label: string;
  address_line: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;
  province: string | null;
  country: string;
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
  status: "attivo" | "disattivato" | "revocato";
  visible_to_partners: boolean;
  address_functions: AddressFunctionRow[];
};

type Owner = { companyId: string } | { customerRecordId: string };

const emptyForm = {
  label: "",
  address_line: "",
  street_number: "",
  postal_code: "",
  city: "",
  province: "",
  country: "Italia",
  contact_name: "",
  phone: "",
  notes: "",
  visible_to_partners: false,
};

type FormState = typeof emptyForm & {
  functions: AddressFunctionCode[];
  defaults: AddressFunctionCode[];
};

const emptyState: FormState = { ...emptyForm, functions: [], defaults: [] };

function ownerFilter(owner: Owner) {
  return "companyId" in owner
    ? { column: "company_id" as const, value: owner.companyId }
    : { column: "customer_record_id" as const, value: owner.customerRecordId };
}

export function AddressManager({
  owner,
  isAdmin,
  showPartnerVisibility = true,
}: {
  owner: Owner;
  isAdmin: boolean;
  showPartnerVisibility?: boolean;
}) {
  const queryClient = useQueryClient();
  const filter = ownerFilter(owner);
  const queryKey = ["addresses", filter.column, filter.value] as const;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AddressRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyState);
  const [busy, setBusy] = useState(false);

  const addressesQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<AddressRow[]> => {
      const { data, error } = await supabase
        .from("addresses")
        .select(
          "id, label, address_line, street_number, postal_code, city, province, country, contact_name, phone, notes, status, visible_to_partners, address_functions(id, function, is_default)",
        )
        .eq(filter.column, filter.value)
        .order("label");
      if (error) throw error;
      return (data ?? []) as AddressRow[];
    },
  });

  function openNew() {
    setEditing(null);
    setForm(emptyState);
    setOpen(true);
  }

  function openEdit(row: AddressRow) {
    setEditing(row);
    setForm({
      label: row.label,
      address_line: row.address_line ?? "",
      street_number: row.street_number ?? "",
      postal_code: row.postal_code ?? "",
      city: row.city ?? "",
      province: row.province ?? "",
      country: row.country ?? "Italia",
      contact_name: row.contact_name ?? "",
      phone: row.phone ?? "",
      notes: row.notes ?? "",
      visible_to_partners: row.visible_to_partners,
      functions: row.address_functions.map((f) => f.function),
      defaults: row.address_functions.filter((f) => f.is_default).map((f) => f.function),
    });
    setOpen(true);
  }

  function toggleFunction(code: AddressFunctionCode) {
    setForm((prev) => {
      const active = prev.functions.includes(code);
      return {
        ...prev,
        functions: active ? prev.functions.filter((f) => f !== code) : [...prev.functions, code],
        defaults: active ? prev.defaults.filter((f) => f !== code) : prev.defaults,
      };
    });
  }

  function toggleDefault(code: AddressFunctionCode) {
    setForm((prev) => ({
      ...prev,
      defaults: prev.defaults.includes(code)
        ? prev.defaults.filter((f) => f !== code)
        : [...prev.defaults, code],
    }));
  }

  async function save() {
    if (!form.label.trim()) {
      toast.error("Indica un nome per questo indirizzo");
      return;
    }
    setBusy(true);
    const payload = {
      label: form.label.trim(),
      address_line: form.address_line || null,
      street_number: form.street_number || null,
      postal_code: form.postal_code || null,
      city: form.city || null,
      province: form.province || null,
      country: form.country || "Italia",
      contact_name: form.contact_name || null,
      phone: form.phone || null,
      notes: form.notes || null,
      visible_to_partners: form.visible_to_partners,
    };

    let addressId = editing?.id ?? null;
    if (editing) {
      const { error } = await supabase.from("addresses").update(payload).eq("id", editing.id);
      if (error) {
        setBusy(false);
        toast.error(error.message);
        return;
      }
    } else {
      const insert =
        "companyId" in owner
          ? { ...payload, company_id: owner.companyId }
          : { ...payload, customer_record_id: owner.customerRecordId };
      const { data, error } = await supabase.from("addresses").insert(insert).select("id").single();
      if (error || !data) {
        setBusy(false);
        toast.error(error?.message ?? "Non è stato possibile salvare l'indirizzo");
        return;
      }
      addressId = data.id;
    }

    if (addressId) {
      const existing = editing?.address_functions ?? [];
      const toRemove = existing.filter((f) => !form.functions.includes(f.function));
      if (toRemove.length) {
        await supabase
          .from("address_functions")
          .delete()
          .in(
            "id",
            toRemove.map((f) => f.id),
          );
      }
      for (const code of form.functions) {
        const isDefault = form.defaults.includes(code);
        const current = existing.find((f) => f.function === code);
        if (current) {
          if (current.is_default !== isDefault) {
            await supabase
              .from("address_functions")
              .update({ is_default: isDefault })
              .eq("id", current.id);
          }
        } else {
          const { error } = await supabase
            .from("address_functions")
            .insert({ address_id: addressId, function: code, is_default: isDefault });
          if (error) toast.error(error.message);
        }
      }
    }

    setBusy(false);
    setOpen(false);
    await queryClient.invalidateQueries({ queryKey });
    toast.success(editing ? "Indirizzo aggiornato." : "Indirizzo aggiunto.");
  }

  async function toggleStatus(row: AddressRow) {
    const { error } = await supabase
      .from("addresses")
      .update({ status: row.status === "attivo" ? "disattivato" : "attivo" })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey });
  }

  const rows = addressesQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Indirizzi
        </h3>
        <Button size="sm" variant="outline" disabled={!isAdmin} onClick={openNew}>
          Aggiungi indirizzo
        </Button>
      </div>

      {addressesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : rows.length ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {row.label}
                  {row.status === "attivo" ? "" : " · non attivo"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[
                    [row.address_line, row.street_number].filter(Boolean).join(" "),
                    [row.postal_code, row.city, row.province].filter(Boolean).join(" "),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Indirizzo da completare"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.address_functions.length
                    ? row.address_functions
                        .map(
                          (f) =>
                            `${ADDRESS_FUNCTIONS.find((x) => x.code === f.function)?.label ?? f.function}${f.is_default ? " ★" : ""}`,
                        )
                        .join(" · ")
                    : "Nessuna funzione assegnata"}
                  {showPartnerVisibility
                    ? row.visible_to_partners
                      ? " · visibile ai partner"
                      : " · non visibile ai partner"
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => openEdit(row)}>
                  Modifica
                </Button>
                <Button size="sm" variant="ghost" disabled={!isAdmin} onClick={() => toggleStatus(row)}>
                  {row.status === "attivo" ? "Disattiva" : "Riattiva"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nessun indirizzo: aggiungi la sede e i punti di consegna o ritiro.
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica indirizzo" : "Nuovo indirizzo"}</DialogTitle>
            <DialogDescription>
              Lo stesso indirizzo può avere più funzioni. La stella indica il predefinito per quella
              funzione.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Nome sede"
              value={form.label}
              onChange={(v) => setForm({ ...form, label: v })}
              className="sm:col-span-2"
            />
            <Field
              label="Indirizzo"
              value={form.address_line}
              onChange={(v) => setForm({ ...form, address_line: v })}
            />
            <Field
              label="Numero civico"
              value={form.street_number}
              onChange={(v) => setForm({ ...form, street_number: v })}
            />
            <Field
              label="CAP"
              value={form.postal_code}
              onChange={(v) => setForm({ ...form, postal_code: v })}
            />
            <Field label="Città" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
            <Field
              label="Provincia"
              value={form.province}
              onChange={(v) => setForm({ ...form, province: v })}
            />
            <Field
              label="Paese"
              value={form.country}
              onChange={(v) => setForm({ ...form, country: v })}
            />
            <Field
              label="Referente"
              value={form.contact_name}
              onChange={(v) => setForm({ ...form, contact_name: v })}
            />
            <Field
              label="Telefono"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
            />
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="addr-notes">Note operative</Label>
              <Textarea
                id="addr-notes"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">A cosa serve questo indirizzo</p>
            {ADDRESS_FUNCTIONS.map((fn) => {
              const active = form.functions.includes(fn.code);
              return (
                <div key={fn.code} className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={active}
                      onCheckedChange={() => toggleFunction(fn.code)}
                      aria-label={fn.label}
                    />
                    {fn.label}
                  </label>
                  {active ? (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={form.defaults.includes(fn.code)}
                        onCheckedChange={() => toggleDefault(fn.code)}
                        aria-label={`Predefinito per ${fn.label}`}
                      />
                      Predefinito
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>

          {showPartnerVisibility ? (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Visibile alle aziende collegate</p>
                <p className="text-xs text-muted-foreground">
                  Attiva solo per gli indirizzi che il partner deve conoscere, per esempio consegna o
                  ritiro. Sedi e magazzini interni restano privati.
                </p>
              </div>
              <Switch
                checked={form.visible_to_partners}
                onCheckedChange={(v) => setForm({ ...form, visible_to_partners: v })}
                aria-label="Visibile alle aziende collegate"
              />
            </div>
          ) : null}

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

function Field({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const id = `addr-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
