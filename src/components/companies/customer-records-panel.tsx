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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

/**
 * Anagrafica clienti del venditore: descrive un cliente amministrativo.
 * Non è un account e non dà accesso: resta valida anche se il cliente
 * non si registrerà mai su Trevi Fruit.
 */
export type CustomerRecord = {
  id: string;
  legal_name: string;
  vat_number: string | null;
  vat_normalized: string | null;
  tax_code: string | null;
  email: string | null;
  phone: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  province: string | null;
  internal_reference: string | null;
  notes: string | null;
  status: "attivo" | "disattivato" | "revocato";
};

type Invitation = {
  id: string;
  customer_record_id: string | null;
  email: string;
  status: "in_attesa" | "accettato" | "annullato" | "annullato_scaduto";
  expires_at: string;
  resend_count: number;
};

const emptyForm = {
  legal_name: "",
  vat_number: "",
  tax_code: "",
  email: "",
  phone: "",
  address_line: "",
  postal_code: "",
  city: "",
  province: "",
  internal_reference: "",
  notes: "",
};

type FormState = typeof emptyForm;

function toForm(record: CustomerRecord): FormState {
  return {
    legal_name: record.legal_name,
    vat_number: record.vat_number ?? "",
    tax_code: record.tax_code ?? "",
    email: record.email ?? "",
    phone: record.phone ?? "",
    address_line: record.address_line ?? "",
    postal_code: record.postal_code ?? "",
    city: record.city ?? "",
    province: record.province ?? "",
    internal_reference: record.internal_reference ?? "",
    notes: record.notes ?? "",
  };
}

const invitationLabel: Record<Invitation["status"], string> = {
  in_attesa: "Invito in attesa",
  accettato: "Invito accettato",
  annullato: "Invito annullato",
  annullato_scaduto: "Invito scaduto",
};

export const customerRecordsQueryKey = ["customer-records"] as const;

export function CustomerRecordsPanel({
  companyId,
  isAdmin,
}: {
  companyId: string;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [inviteFor, setInviteFor] = useState<CustomerRecord | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const recordsQuery = useQuery({
    queryKey: customerRecordsQueryKey,
    queryFn: async (): Promise<CustomerRecord[]> => {
      const { data, error } = await supabase
        .from("customer_records")
        .select(
          "id, legal_name, vat_number, vat_normalized, tax_code, email, phone, address_line, postal_code, city, province, internal_reference, notes, status",
        )
        .eq("seller_company_id", companyId)
        .order("legal_name");
      if (error) throw error;
      return (data ?? []) as CustomerRecord[];
    },
  });

  const invitationsQuery = useQuery({
    queryKey: ["company-invitations"],
    queryFn: async (): Promise<Invitation[]> => {
      const { data, error } = await supabase
        .from("company_invitations")
        .select("id, customer_record_id, email, status, expires_at, resend_count")
        .eq("seller_company_id", companyId)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invitation[];
    },
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: customerRecordsQueryKey }),
      queryClient.invalidateQueries({ queryKey: ["company-invitations"] }),
    ]);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(record: CustomerRecord) {
    setEditing(record);
    setForm(toForm(record));
    setFormOpen(true);
  }

  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc("manage_customer_record", {
      _seller_company_id: companyId,
      _action: editing ? "update" : "create",
      ...(editing ? { _customer_record_id: editing.id } : {}),
      _legal_name: form.legal_name,
      _vat_number: form.vat_number,
      _tax_code: form.tax_code,
      _email: form.email,
      _phone: form.phone,
      _address_line: form.address_line,
      _postal_code: form.postal_code,
      _city: form.city,
      _province: form.province,
      _internal_reference: form.internal_reference,
      _notes: form.notes,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFormOpen(false);
    await refresh();
    toast.success(editing ? "Cliente aggiornato." : "Cliente aggiunto all'anagrafica.");
  }

  async function toggleStatus(record: CustomerRecord) {
    const { error } = await supabase.rpc("manage_customer_record", {
      _seller_company_id: companyId,
      _action: record.status === "attivo" ? "deactivate" : "activate",
      _customer_record_id: record.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    toast.success(record.status === "attivo" ? "Cliente disattivato." : "Cliente riattivato.");
  }

  function openInvite(record: CustomerRecord) {
    setInviteFor(record);
    setInviteEmail(record.email ?? "");
    setInviteLink(null);
  }

  function linkFor(token: string) {
    return `${window.location.origin}/invito/${token}`;
  }

  async function sendInvite() {
    if (!inviteFor) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("create_customer_invitation", {
      _customer_record_id: inviteFor.id,
      _email: inviteEmail,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const token = (data ?? [])[0]?.token;
    if (token) setInviteLink(linkFor(token));
    await refresh();
  }

  async function resend(invitationId: string) {
    const { data, error } = await supabase.rpc("resend_customer_invitation", {
      _invitation_id: invitationId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const token = (data ?? [])[0]?.token;
    if (token) {
      setInviteFor(null);
      setInviteLink(linkFor(token));
    }
    await refresh();
  }

  async function cancelInvite(invitationId: string) {
    const { error } = await supabase.rpc("cancel_customer_invitation", {
      _invitation_id: invitationId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    toast.success("Invito annullato.");
  }

  const records = recordsQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Anagrafica clienti
        </h2>
        <Button size="sm" disabled={!isAdmin} onClick={openNew}>
          Nuovo cliente
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Puoi registrare qui tutti i tuoi clienti, anche quelli che non usano Trevi Fruit.
      </p>

      {recordsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : records.length ? (
        records.map((record) => {
          const pending = invitations.find(
            (inv) => inv.customer_record_id === record.id && inv.status === "in_attesa",
          );
          const last = invitations.find((inv) => inv.customer_record_id === record.id);
          return (
            <section
              key={record.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <h3 className="font-display text-base font-semibold">{record.legal_name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[
                    record.vat_number ? `P.IVA ${record.vat_number}` : null,
                    [record.city, record.province].filter(Boolean).join(" ") || null,
                    record.status === "attivo" ? null : "Disattivato",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Dati essenziali da completare"}
                </p>
                {last ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {invitationLabel[last.status]} · {last.email}
                    {last.resend_count ? ` · reinvii: ${last.resend_count}` : ""}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(record)}>
                  Dettagli
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!isAdmin}
                  onClick={() => openInvite(record)}
                >
                  Invita
                </Button>
                {pending ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!isAdmin}
                      onClick={() => resend(pending.id)}
                    >
                      Reinvia
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!isAdmin}
                      onClick={() => cancelInvite(pending.id)}
                    >
                      Annulla invito
                    </Button>
                  </>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!isAdmin}
                  onClick={() => toggleStatus(record)}
                >
                  {record.status === "attivo" ? "Disattiva" : "Riattiva"}
                </Button>
              </div>
            </section>
          );
        })
      ) : (
        <p className="text-sm text-muted-foreground">
          Nessun cliente in anagrafica: aggiungi il primo con “Nuovo cliente”.
        </p>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Dettagli cliente" : "Nuovo cliente"}</DialogTitle>
            <DialogDescription>
              La scheda cliente è tua e resta valida anche senza un account del cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Ragione sociale"
              value={form.legal_name}
              onChange={(v) => setForm({ ...form, legal_name: v })}
              className="sm:col-span-2"
            />
            <Field
              label="Partita IVA"
              value={form.vat_number}
              onChange={(v) => setForm({ ...form, vat_number: v })}
            />
            <Field
              label="Codice fiscale"
              value={form.tax_code}
              onChange={(v) => setForm({ ...form, tax_code: v })}
            />
            <Field
              label="Email"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
            />
            <Field
              label="Telefono"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
            />
            <Field
              label="Indirizzo"
              value={form.address_line}
              onChange={(v) => setForm({ ...form, address_line: v })}
              className="sm:col-span-2"
            />
            <Field label="CAP" value={form.postal_code} onChange={(v) => setForm({ ...form, postal_code: v })} />
            <Field label="Città" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
            <Field
              label="Provincia"
              value={form.province}
              onChange={(v) => setForm({ ...form, province: v })}
            />
            <Field
              label="Riferimento interno"
              value={form.internal_reference}
              onChange={(v) => setForm({ ...form, internal_reference: v })}
            />
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Note</Label>
              <Textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
          </div>

          {editing ? (
            <div className="mt-4 border-t border-border pt-4">
              <AddressManager
                owner={{ customerRecordId: editing.id }}
                isAdmin={isAdmin}
                showPartnerVisibility={false}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Chiudi
            </Button>
            <Button disabled={busy || !isAdmin} onClick={save}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(inviteFor) || Boolean(inviteLink)}
        onOpenChange={(open) => {
          if (!open) {
            setInviteFor(null);
            setInviteLink(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invita il cliente su Trevi Fruit</DialogTitle>
            <DialogDescription>
              L’invito collega la tua azienda a quella del cliente. Il collegamento avviene solo
              dopo la sua accettazione e con partita IVA coerente.
            </DialogDescription>
          </DialogHeader>
          {inviteLink ? (
            <div className="space-y-2">
              <p className="text-sm">
                Invia questo indirizzo al cliente: è valido una sola volta e scade automaticamente.
              </p>
              <Input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} />
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label>Email del cliente</Label>
              <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            {inviteLink ? (
              <Button
                onClick={() => {
                  setInviteFor(null);
                  setInviteLink(null);
                }}
              >
                Ho copiato, chiudi
              </Button>
            ) : (
              <Button disabled={busy || !isAdmin} onClick={sendInvite}>
                Genera invito
              </Button>
            )}
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
  const id = `cr-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
