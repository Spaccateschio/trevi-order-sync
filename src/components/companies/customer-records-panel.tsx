import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useIdentity } from "@/hooks/use-identity";
import { linkStatusOf } from "@/lib/relation-link-status";

import { AddressManager } from "@/components/companies/address-manager";
import { CustomerImportDialog } from "@/components/companies/customer-import-dialog";
import { DestinationManager } from "@/components/companies/destination-manager";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { sendInvitationEmail } from "@/lib/invitation-email.functions";

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
  const { data: identity } = useIdentity();
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [inviteFor, setInviteFor] = useState<CustomerRecord | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteRecipient, setInviteRecipient] = useState<string | null>(null);
  const [inviteExpires, setInviteExpires] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkResults, setBulkResults] = useState<
    {
      name: string;
      email: string;
      link?: string;
      code?: string | null;
      expiresAt?: string | null;
      error?: string;
    }[]
  >([]);

  /** Dati aziendali stampati sul foglio invito: sola lettura. */
  const companyQuery = useQuery({
    queryKey: ["company-contact", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("legal_name, email, phone")
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const invitedBy = [identity?.profile?.firstName, identity?.profile?.lastName]
    .filter(Boolean)
    .join(" ");

  function pdfBase() {
    return {
      sellerName: companyQuery.data?.legal_name ?? "La tua azienda",
      sellerEmail: companyQuery.data?.email ?? null,
      sellerPhone: companyQuery.data?.phone ?? null,
      invitedBy: invitedBy || null,
    };
  }

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
    setInviteRecipient(record.legal_name);
    setInviteExpires(null);
  }

  function linkFor(token: string) {
    return `${window.location.origin}/invito/${token}`;
  }

  /** Scadenza e codice dell'invito appena creato o rinnovato: sola lettura. */
  async function fetchInviteMeta(invitationId: string) {
    const { data } = await supabase
      .from("company_invitations")
      .select("expires_at, invite_code")
      .eq("id", invitationId)
      .maybeSingle();
    return { expiresAt: data?.expires_at ?? null, code: data?.invite_code ?? null };
  }

  async function downloadCurrentInvitePdf() {
    if (!inviteLink) return;
    const { downloadInvitePdf } = await import("@/lib/invite-pdf");
    await downloadInvitePdf({
      ...pdfBase(),
      recipientName: inviteRecipient,
      inviteCode,
      inviteLink,
      expiresAt: inviteExpires,
    });
  }

  async function downloadBulkInvitePdf() {
    const usable = bulkResults.filter((result) => result.link);
    if (!usable.length) return;
    const { downloadInvitePdfBatch } = await import("@/lib/invite-pdf");
    await downloadInvitePdfBatch(
      usable.map((result) => ({
        ...pdfBase(),
        recipientName: result.name,
        inviteCode: result.code ?? null,
        inviteLink: result.link!,
        expiresAt: result.expiresAt ?? null,
      })),
    );
  }

  /**
   * L'email è una consegna in più: se non parte, codice e link restano
   * validi e l'invito non viene annullato.
   */
  async function deliverInviteEmail(invitationId: string, token: string) {
    try {
      const result = await sendInvitationEmail({ data: { invitationId, token } });
      if (result.sent) {
        toast.success("Invito inviato per email.");
      } else if (result.reason === "no_email") {
        toast.info("Nessuna email indicata: usa il link o il codice.");
      } else {
        toast.info("Questo indirizzo non riceve più le nostre email: usa il link o il codice.");
      }
    } catch {
      toast.error("Email non inviata: puoi comunque usare il link o il codice.");
    }
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
    const row = (data ?? [])[0];
    if (row?.token) setInviteLink(linkFor(row.token));
    setInviteCode(row?.invite_code ?? null);
    setInviteRecipient(inviteFor.legal_name);
    if (row?.invitation_id) {
      const meta = await fetchInviteMeta(row.invitation_id);
      setInviteExpires(meta.expiresAt);
      if (!row?.invite_code) setInviteCode(meta.code);
    }
    if (row?.invitation_id && row?.token) await deliverInviteEmail(row.invitation_id, row.token);
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
    const row = (data ?? [])[0];
    const token = row?.token;
    if (token) {
      const record = records.find(
        (item) =>
          item.id ===
          invitations.find((inv) => inv.id === invitationId)?.customer_record_id,
      );
      setInviteFor(null);
      setInviteRecipient(record?.legal_name ?? null);
      setInviteLink(linkFor(token));
      const meta = await fetchInviteMeta(invitationId);
      setInviteCode(meta.code);
      setInviteExpires(meta.expiresAt);
      await deliverInviteEmail(invitationId, token);
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

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Inviti in blocco: un invito per cliente, gli errori non fermano gli altri. */
  async function generateBulkInvites() {
    const chosen = records.filter((record) => selectedIds.has(record.id));
    if (!chosen.length) return;
    setBusy(true);
    setBulkOpen(true);
    const results: { name: string; email: string; link?: string; error?: string }[] = [];
    for (const record of chosen) {
      const email = (record.email ?? "").trim();
      if (!email) {
        results.push({
          name: record.legal_name,
          email: "",
          error: "Manca l’email: aggiungila nella scheda cliente.",
        });
        continue;
      }
      const pending = invitations.find(
        (inv) => inv.customer_record_id === record.id && inv.status === "in_attesa",
      );
      // Se un invito è già in attesa lo rinnoviamo, così l'elenco resta completo.
      const { data, error } = pending
        ? await supabase.rpc("resend_customer_invitation", { _invitation_id: pending.id })
        : await supabase.rpc("create_customer_invitation", {
            _customer_record_id: record.id,
            _email: email,
          });
      if (error) {
        results.push({ name: record.legal_name, email, error: error.message });
        continue;
      }
      const row = (data ?? [])[0];
      const token = row?.token;
      const invitationId = pending ? pending.id : row?.invitation_id;
      if (token && invitationId) {
        // L'email è una consegna in più: un errore non invalida l'invito.
        try {
          await sendInvitationEmail({ data: { invitationId, token } });
        } catch {
          /* il link resta valido e resta nell'elenco copiabile */
        }
      }
      const meta = invitationId ? await fetchInviteMeta(invitationId) : null;
      results.push({
        name: record.legal_name,
        email,
        code: meta?.code ?? null,
        expiresAt: meta?.expiresAt ?? null,
        ...(token ? { link: linkFor(token) } : { error: "Invito non generato." }),
      });
    }
    setBulkResults(results);
    setBusy(false);
    await refresh();
  }

  const bulkText = bulkResults
    .filter((result) => result.link)
    .map((result) => `${result.name}\t${result.email}\t${result.link}`)
    .join("\n");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Anagrafica clienti
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => setImportOpen(true)}>
            Importa da Danea
          </Button>
          <Button size="sm" disabled={!isAdmin} onClick={openNew}>
            Nuovo cliente
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Puoi registrare qui tutti i tuoi clienti, anche quelli che non usano Trevi Fruit.
      </p>

      {selectedIds.size ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-sm">{selectedIds.size} clienti selezionati</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              Annulla selezione
            </Button>
            <Button size="sm" disabled={busy || !isAdmin} onClick={generateBulkInvites}>
              Genera inviti per i selezionati
            </Button>
          </div>
        </div>
      ) : null}


      {recordsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : records.length ? (
        records.map((record) => {
          const pending = invitations.find(
            (inv) => inv.customer_record_id === record.id && inv.status === "in_attesa",
          );
          const last = invitations.find((inv) => inv.customer_record_id === record.id);
          // Stessa relazione della pagina Collegamenti, qui solo in lettura.
          const relation = (identity?.relations ?? []).find(
            (r) => r.sellerCompanyId === companyId && r.customerRecordId === record.id,
          );
          const link = linkStatusOf(relation, Boolean(pending));
          return (
            <section
              key={record.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <Checkbox
                  className="mt-1"
                  checked={selectedIds.has(record.id)}
                  onCheckedChange={() => toggleSelect(record.id)}
                  aria-label={`Seleziona ${record.legal_name}`}
                />
                <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-base font-semibold">{record.legal_name}</h3>
                  <Link
                    to="/collegamenti"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                    title="Stato del collegamento su Trevi Fruit"
                  >
                    <span
                      aria-hidden
                      className={`size-2 rounded-full ${link.dotClassName}`}
                    />
                    {link.label}
                  </Link>
                </div>
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
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(record)}>
                  Dettagli
                </Button>
                {link.key === "attivo" || link.key === "sospeso" ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!isAdmin}
                    onClick={() => openInvite(record)}
                  >
                    Invita
                  </Button>
                )}
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
          {editing ? (
            <div className="mt-4 border-t border-border pt-4">
              <DestinationManager customerRecordId={editing.id} isAdmin={isAdmin} />
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
            setInviteCode(null);
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
              {inviteCode ? (
                <p className="text-sm text-muted-foreground">
                  Se il cliente è già su Trevi Fruit può usare il codice{" "}
                  <span className="font-mono tracking-widest text-foreground">{inviteCode}</span>{" "}
                  dalla pagina Collegamenti.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label>Email del cliente</Label>
              <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            {inviteLink ? (
              <>
                <Button variant="outline" onClick={downloadCurrentInvitePdf}>
                  Scarica PDF
                </Button>
                <Button
                  onClick={() => {
                    setInviteFor(null);
                    setInviteLink(null);
                    setInviteCode(null);
                    setInviteRecipient(null);
                    setInviteExpires(null);
                  }}
                >
                  Ho copiato, chiudi
                </Button>
              </>
            ) : (
              <Button disabled={busy || !isAdmin} onClick={sendInvite}>
                Genera invito
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomerImportDialog
        companyId={companyId}
        existing={records.map((record) => ({
          id: record.id,
          legal_name: record.legal_name,
          vat_normalized: record.vat_normalized,
          tax_code: record.tax_code,
          internal_reference: record.internal_reference,
        }))}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={refresh}
      />

      <Dialog
        open={bulkOpen}
        onOpenChange={(value) => {
          setBulkOpen(value);
          if (!value) setBulkResults([]);
        }}
      >
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inviti per i clienti selezionati</DialogTitle>
            <DialogDescription>
              Copia l’elenco e invia a ciascun cliente il proprio indirizzo: ogni link vale una sola
              volta e scade automaticamente.
            </DialogDescription>
          </DialogHeader>
          {busy ? (
            <p className="text-sm text-muted-foreground">Generazione inviti…</p>
          ) : (
            <div className="space-y-3">
              {bulkText ? (
                <Textarea
                  readOnly
                  rows={Math.min(12, bulkResults.length + 1)}
                  value={bulkText}
                  onFocus={(event) => event.currentTarget.select()}
                />
              ) : null}
              {bulkResults.some((result) => result.error) ? (
                <div className="space-y-1 rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">Inviti non generati</p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {bulkResults
                      .filter((result) => result.error)
                      .map((result) => (
                        <li key={`${result.name}-${result.email}`}>
                          {result.name}: {result.error}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
          <DialogFooter>
            {bulkResults.some((result) => result.link) ? (
              <Button variant="outline" disabled={busy} onClick={downloadBulkInvitePdf}>
                Scarica PDF ({bulkResults.filter((result) => result.link).length} pagine)
              </Button>
            ) : null}
            <Button
              onClick={() => {
                setBulkOpen(false);
                setBulkResults([]);
              }}
            >
              Chiudi
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
  const id = `cr-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
