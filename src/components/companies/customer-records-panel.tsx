import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { useMemo, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CUSTOMER_COLUMNS,
  LOCKED_CUSTOMER_COLUMN,
  customerMatchesQuery,
  loadCustomerColumnWidths,
  loadCustomerColumns,
  saveCustomerColumnWidths,
  saveCustomerColumns,
  type CustomerColumnKey,
} from "@/lib/customer-columns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { DANEA_EXTRA_GROUP_BY_LABEL } from "@/lib/customer-import";
import { sendInvitationEmail } from "@/lib/invitation-email.functions";
import {
  downloadCustomersCsv,
  downloadCustomersExcel,
  printCustomers,
} from "@/lib/customer-export";
import {
  fetchActivePriceLists,
  fetchDefaultPriceList,
  setCustomerPriceList,
} from "@/lib/price-lists";

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
  assigned_price_list_number: number | null;
  region: string | null;
  country: string | null;
  sdi_code: string | null;
  sdi_admin_reference: string | null;
  contact_name: string | null;
  fax: string | null;
  pec: string | null;
  discounts: string | null;
  credit_limit: string | null;
  agent: string | null;
  payment_terms: string | null;
  bank: string | null;
  our_bank: string | null;
  danea_extra: Record<string, string> | null;
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
  contact_name: "",
  fax: "",
  pec: "",
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
    contact_name: record.contact_name ?? "",
    fax: record.fax ?? "",
    pec: record.pec ?? "",
  };
}


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
  const [invitePriceList, setInvitePriceList] = useState<string>("nessuno");
  const [importOpen, setImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<CustomerColumnKey[]>(() =>
    loadCustomerColumns(),
  );
  const [sort, setSort] = useState<{ key: CustomerColumnKey; asc: boolean }>({
    key: "legal_name",
    asc: true,
  });
  const [columnWidths, setColumnWidths] = useState<Record<CustomerColumnKey, number>>(() =>
    loadCustomerColumnWidths(),
  );
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

  /** Listini Danea attivi dell'azienda venditrice: unica origine dei prezzi. */
  const priceListsQuery = useQuery({
    queryKey: ["listini-attivi", companyId],
    queryFn: () => fetchActivePriceLists(companyId),
  });

  const defaultPriceListQuery = useQuery({
    queryKey: ["listino-predefinito", companyId],
    queryFn: () => fetchDefaultPriceList(companyId),
  });

  const priceLists = priceListsQuery.data ?? [];

  async function assignPriceList(record: CustomerRecord, value: string) {
    try {
      await setCustomerPriceList(record.id, value === "nessuno" ? null : Number(value));
      toast.success(
        value === "nessuno"
          ? "Listino rimosso: il cliente vedrà i prezzi su richiesta."
          : "Listino assegnato: il cliente vede subito i prezzi nel catalogo.",
      );
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Assegnazione non riuscita");
    }
  }

  const recordsQuery = useQuery({
    queryKey: customerRecordsQueryKey,
    queryFn: async (): Promise<CustomerRecord[]> => {
      const { data, error } = await supabase
        .from("customer_records")
        .select(
          "id, legal_name, vat_number, vat_normalized, tax_code, email, phone, address_line, postal_code, city, province, internal_reference, notes, status, assigned_price_list_number, region, country, sdi_code, sdi_admin_reference, contact_name, fax, pec, discounts, credit_limit, agent, payment_terms, bank, our_bank, danea_extra",
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
      _contact_name: form.contact_name,
      _fax: form.fax,
      _pec: form.pec,
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
    // Precompilato: listino già assegnato al cliente, altrimenti predefinito dell'azienda.
    const suggested = record.assigned_price_list_number ?? defaultPriceListQuery.data ?? null;
    setInvitePriceList(suggested === null ? "nessuno" : String(suggested));
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
      ...(invitePriceList === "nessuno" ? {} : { _price_list_number: Number(invitePriceList) }),
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

  const allRecords = recordsQuery.data ?? [];
  // I clienti eliminati restano in archivio con stato "revocato": nascosti, non cancellati.
  const records = allRecords.filter((record) => record.status !== "revocato");
  const deletedRecords = allRecords.filter((record) => record.status === "revocato");
  const invitations = invitationsQuery.data ?? [];

  /** Eliminazione morbida: il cliente sparisce dall'elenco ma i dati restano. */
  async function softDelete(record: CustomerRecord) {
    const { error } = await supabase.rpc("manage_customer_record_status", {
      _seller_company_id: companyId,
      _customer_record_id: record.id,
      _action: "delete",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(record.id);
      return next;
    });
    setDeleteFor(null);
    await refresh();
    toast.success("Cliente eliminato: puoi recuperarlo da “Clienti eliminati”.");
  }

  async function restoreRecord(record: CustomerRecord) {
    const { error } = await supabase.rpc("manage_customer_record_status", {
      _seller_company_id: companyId,
      _customer_record_id: record.id,
      _action: "restore",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    toast.success("Cliente ripristinato.");
  }


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
    const results: {
      name: string;
      email: string;
      link?: string;
      code?: string | null;
      expiresAt?: string | null;
      error?: string;
    }[] = [];
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

  const columns = CUSTOMER_COLUMNS.filter((column) => visibleColumns.includes(column.key));

  const filtered = useMemo(() => {
    const list = records.filter((record) => customerMatchesQuery(record, search));
    const column = CUSTOMER_COLUMNS.find((c) => c.key === sort.key);
    if (!column) return list;
    return [...list].sort((a, b) => {
      const result = column.value(a).localeCompare(column.value(b), "it", { numeric: true });
      return sort.asc ? result : -result;
    });
  }, [records, search, sort]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((record) => selectedIds.has(record.id));

  function toggleAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((record) => next.delete(record.id));
      else filtered.forEach((record) => next.add(record.id));
      return next;
    });
  }

  function toggleColumn(key: CustomerColumnKey) {
    setVisibleColumns((prev) => {
      const next = prev.includes(key)
        ? prev.filter((item) => item !== key)
        : [...CUSTOMER_COLUMNS.map((c) => c.key)].filter(
            (item) => prev.includes(item) || item === key,
          );
      const safe = next.includes(LOCKED_CUSTOMER_COLUMN)
        ? next
        : [...next, LOCKED_CUSTOMER_COLUMN];
      saveCustomerColumns(safe);
      return safe;
    });
  }

  function toggleSort(key: CustomerColumnKey) {
    setSort((prev) => (prev.key === key ? { key, asc: !prev.asc } : { key, asc: true }));
  }

  /** Riepilogo di riga usato nella lista compatta su smartphone. */
  function rowInfo(record: CustomerRecord) {
    const pending = invitations.find(
      (inv) => inv.customer_record_id === record.id && inv.status === "in_attesa",
    );
    // Stessa relazione della pagina Collegamenti, qui solo in lettura.
    const relation = (identity?.relations ?? []).find(
      (r) => r.sellerCompanyId === companyId && r.customerRecordId === record.id,
    );
    return { pending, link: linkStatusOf(relation, Boolean(pending)) };
  }

  function RowActions({ record }: { record: CustomerRecord }) {
    const { pending, link } = rowInfo(record);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={(event) => event.stopPropagation()}
          >
            Azioni
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuItem onSelect={() => openEdit(record)}>Dettagli</DropdownMenuItem>
          {link.key === "attivo" || link.key === "sospeso" ? null : (
            <DropdownMenuItem disabled={!isAdmin} onSelect={() => openInvite(record)}>
              Invita
            </DropdownMenuItem>
          )}
          {pending ? (
            <>
              <DropdownMenuItem disabled={!isAdmin} onSelect={() => void resend(pending.id)}>
                Reinvia invito
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!isAdmin} onSelect={() => void cancelInvite(pending.id)}>
                Annulla invito
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!isAdmin} onSelect={() => void toggleStatus(record)}>
            {record.status === "attivo" ? "Disattiva" : "Riattiva"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!isAdmin}
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleteFor(record)}
          >
            Elimina cliente
          </DropdownMenuItem>

        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function priceListText(record: CustomerRecord) {
    if (record.assigned_price_list_number === null) return "Nessuno · prezzi su richiesta";
    return (
      priceLists.find((item) => item.listNumber === record.assigned_price_list_number)?.label ??
      `Listino ${record.assigned_price_list_number}`
    );
  }

  function LinkCell({ record }: { record: CustomerRecord }) {
    const { link } = rowInfo(record);
    return (
      <Link
        to="/collegamenti"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        title="Stato del collegamento su Trevi Fruit"
        onClick={(event) => event.stopPropagation()}
      >
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${link.dotClassName}`} />
        <span className="truncate">{link.label}</span>
      </Link>
    );
  }

  function cellContent(column: (typeof CUSTOMER_COLUMNS)[number], record: CustomerRecord) {
    if (column.key === "price_list")
      return <span className="text-muted-foreground">{priceListText(record)}</span>;
    if (column.key === "link") return <LinkCell record={record} />;
    if (column.key === "legal_name")
      return <span className="font-medium">{record.legal_name}</span>;
    return <span className="text-muted-foreground">{column.value(record) || "—"}</span>;
  }

  function exportContext() {
    const chosen = filtered.filter((record) => selectedIds.has(record.id));
    return {
      columns,
      records: chosen,
      priceListLabel: priceListText,
      linkLabel: (record: CustomerRecord) => rowInfo(record).link.label,
    };
  }

  function resizeColumn(event: React.PointerEvent, key: CustomerColumnKey) {
    event.preventDefault();
    event.stopPropagation();
    const table = event.currentTarget.closest("table");
    if (!table) return;
    const startX = event.clientX;
    const startWidth = columnWidths[key];
    const tableWidth = table.getBoundingClientRect().width;
    if (!tableWidth) return;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = ((moveEvent.clientX - startX) / tableWidth) * 100;
      setColumnWidths((current) => ({ ...current, [key]: Math.max(3, startWidth + delta) }));
    };
    const onUp = () => {
      setColumnWidths((current) => {
        saveCustomerColumnWidths(current);
        return current;
      });
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  const visibleWeight = columns.reduce((total, column) => total + columnWidths[column.key], 0);
  const columnPercent = (key: CustomerColumnKey) =>
    `${(columnWidths[key] / Math.max(visibleWeight, 1)) * 100}%`;
  const densityClass = columns.length >= 12 ? "text-[8px]" : columns.length >= 8 ? "text-[9px]" : "text-[10px]";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap sm:justify-between">
        <h2 className="truncate font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Anagrafica clienti
        </h2>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => setImportOpen(true)}>
            Importa da Danea
          </Button>
          <Button size="sm" disabled={!isAdmin} onClick={openNew}>
            Nuovo cliente
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cerca per nome, P.IVA, città o codice"
          className="h-8 w-full max-w-xs text-xs"
          aria-label="Cerca cliente"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 text-xs">
              Colonne
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
            <DropdownMenuLabel>Dati da visualizzare</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {CUSTOMER_COLUMNS.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.key}
                checked={visibleColumns.includes(column.key)}
                disabled={column.key === LOCKED_CUSTOMER_COLUMN}
                onCheckedChange={() => toggleColumn(column.key)}
                onSelect={(event) => event.preventDefault()}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="ml-auto text-xs text-muted-foreground">
          {filtered.length} clienti
          {selectedIds.size ? ` · ${selectedIds.size} selezionati` : ""}
        </p>
      </div>

      {selectedIds.size ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-2">
          <p className="text-xs">{selectedIds.size} clienti selezionati</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setSelectedIds(new Set())}
            >
              Annulla selezione
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                try {
                  printCustomers(exportContext());
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Stampa non disponibile");
                }
              }}
            >
              <Printer /> Stampa
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => void downloadCustomersExcel(exportContext())}
            >
              <FileSpreadsheet /> Salva Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => downloadCustomersCsv(exportContext())}
            >
              <Download /> Salva CSV
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={busy || !isAdmin}
              onClick={generateBulkInvites}
            >
              Genera inviti per i selezionati
            </Button>
          </div>
        </div>
      ) : null}

      {recordsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : !records.length ? (
        <p className="text-sm text-muted-foreground">
          Nessun cliente in anagrafica: aggiungi il primo con “Nuovo cliente”.
        </p>
      ) : !filtered.length ? (
        <p className="text-sm text-muted-foreground">Nessun cliente corrisponde alla ricerca.</p>
      ) : (
        <>
          {/* Elenco gestionale: una riga per cliente, testo compatto. */}
          <div className="hidden rounded-lg border border-border bg-card sm:block">
            <table className={`w-full table-fixed border-separate border-spacing-0 ${densityClass}`}>
              <colgroup>
                <col className="w-8" />
                {columns.map((column) => (
                  <col key={column.key} style={{ width: columnPercent(column.key) }} />
                ))}
                <col className="w-14" />
              </colgroup>
              <thead className="sticky top-14 z-10 bg-muted shadow-sm lg:top-0">
                <tr>
                  <th className="h-8 border-b border-r border-border px-1 text-left">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleAllFiltered}
                      aria-label="Seleziona tutti i clienti filtrati"
                    />
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className="relative h-8 min-w-0 cursor-pointer select-none border-b border-r border-border px-1 text-left font-medium text-muted-foreground"
                      onClick={() => toggleSort(column.key)}
                    >
                      <span className="block truncate" title={column.label}>
                        {column.label}{sort.key === column.key ? (sort.asc ? " ▲" : " ▼") : ""}
                      </span>
                      <span
                        role="separator"
                        aria-label={`Ridimensiona ${column.label}`}
                        aria-orientation="vertical"
                        className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize touch-none hover:bg-accent"
                        onPointerDown={(event) => resizeColumn(event, column.key)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </th>
                  ))}
                  <th className="h-8 border-b border-border px-1 text-right font-medium text-muted-foreground">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => (
                  <tr
                    key={record.id}
                    className="cursor-pointer odd:bg-muted/20 hover:bg-muted/50"
                    onClick={() => openEdit(record)}
                  >
                    <td className="border-b border-r border-border px-1 py-1" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(record.id)}
                        onCheckedChange={() => toggleSelect(record.id)}
                        aria-label={`Seleziona ${record.legal_name}`}
                      />
                    </td>
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className="min-w-0 truncate border-b border-r border-border px-1 py-1"
                        title={
                          column.key === "price_list"
                            ? priceListText(record)
                            : column.key === "link"
                              ? rowInfo(record).link.label
                              : column.value(record) || "—"
                        }
                      >
                        <span className="block truncate">{cellContent(column, record)}</span>
                      </td>
                    ))}
                    <td className="border-b border-border px-1 py-1 text-right">
                      <RowActions record={record} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Smartphone: lista compatta con le stesse azioni. */}
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card sm:hidden">
            {filtered.map((record) => (
              <div
                key={record.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 p-2"
                onClick={() => openEdit(record)}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={selectedIds.has(record.id)}
                  onCheckedChange={() => toggleSelect(record.id)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Seleziona ${record.legal_name}`}
                />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{record.legal_name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {[
                      record.internal_reference,
                      [record.city, record.province].filter(Boolean).join(" "),
                      record.vat_number,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Dati essenziali da completare"}
                  </p>
                  <div className="mt-1">
                    <LinkCell record={record} />
                  </div>
                </div>
                <RowActions record={record} />
              </div>
            ))}
          </div>
        </>
      )}


      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Dettagli cliente" : "Nuovo cliente"}</DialogTitle>
            <DialogDescription>
              La scheda cliente è tua e resta valida anche senza un account del cliente. I dati che
              arrivano dal gestionale sono in sola lettura.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="anagrafica">
            <TabsList className="flex w-full flex-wrap">
              <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
              <TabsTrigger value="commerciale">Rapporti commerciali</TabsTrigger>
              <TabsTrigger value="varie">Varie</TabsTrigger>
            </TabsList>

            <TabsContent value="anagrafica" className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Codice"
                  value={form.internal_reference}
                  onChange={(v) => setForm({ ...form, internal_reference: v })}
                />
                <Field
                  label="Codice fiscale"
                  value={form.tax_code}
                  onChange={(v) => setForm({ ...form, tax_code: v })}
                />
                <Field
                  label="Partita IVA"
                  value={form.vat_number}
                  onChange={(v) => setForm({ ...form, vat_number: v })}
                />
                <Field
                  label="Denominazione"
                  value={form.legal_name}
                  onChange={(v) => setForm({ ...form, legal_name: v })}
                />
              </div>

              <Section title="Sede operativa">
                <Field
                  label="Indirizzo"
                  value={form.address_line}
                  onChange={(v) => setForm({ ...form, address_line: v })}
                  className="sm:col-span-2"
                />
                <Field
                  label="CAP"
                  value={form.postal_code}
                  onChange={(v) => setForm({ ...form, postal_code: v })}
                />
                <Field
                  label="Città"
                  value={form.city}
                  onChange={(v) => setForm({ ...form, city: v })}
                />
                <Field
                  label="Provincia"
                  value={form.province}
                  onChange={(v) => setForm({ ...form, province: v })}
                />
                <ReadField label="Regione" value={editing?.region} />
                <ReadField label="Nazione" value={editing?.country} />
              </Section>

              <Section title="Fattura elettronica">
                <ReadField label="Recapito (cod. destinatario)" value={editing?.sdi_code} />
                <ReadField label="Rif. amministrativo" value={editing?.sdi_admin_reference} />
              </Section>

              <Section title="Contatti">
                <Field
                  label="Referente"
                  value={form.contact_name}
                  onChange={(v) => setForm({ ...form, contact_name: v })}
                />
                <Field label="Fax" value={form.fax} onChange={(v) => setForm({ ...form, fax: v })} />
                <Field
                  label="Telefono"
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                />
                <Field
                  label="e-mail"
                  value={form.email}
                  onChange={(v) => setForm({ ...form, email: v })}
                />
                <Field label="PEC" value={form.pec} onChange={(v) => setForm({ ...form, pec: v })} />
              </Section>
            </TabsContent>

            <TabsContent value="commerciale" className="mt-4 space-y-4">
              {editing ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ReadField label="Sconti" value={editing.discounts} />
                    <div className="grid gap-1.5">
                      <Label>Listino</Label>
                      <Select
                        value={
                          editing.assigned_price_list_number === null
                            ? "nessuno"
                            : String(editing.assigned_price_list_number)
                        }
                        onValueChange={(value) => void assignPriceList(editing, value)}
                        disabled={!isAdmin}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Listino" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nessuno">Nessuno · prezzi su richiesta</SelectItem>
                          {priceLists.map((item) => (
                            <SelectItem key={item.listNumber} value={String(item.listNumber)}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <ReadField label="Fido" value={editing.credit_limit} />
                    <ReadField label="Agente" value={editing.agent} />
                    <ReadField label="Pagamento" value={editing.payment_terms} />
                    <ReadField label="Coordinate bancarie" value={editing.bank} />
                    <ReadField label="Nostra banca" value={editing.our_bank} />
                  </div>
                  <ExtraFields record={editing} group="commerciale" />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  I dati commerciali arrivano dal gestionale: saranno visibili dopo il primo
                  salvataggio o l’importazione da Danea.
                </p>
              )}
            </TabsContent>

            <TabsContent value="varie" className="mt-4 space-y-4">
              {editing ? <ExtraFields record={editing} group="varie" /> : null}
              <div className="grid gap-1.5">
                <Label>Note</Label>
                <Textarea
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </div>
              {editing ? <OtherDaneaData record={editing} /> : null}
            </TabsContent>
          </Tabs>

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
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Email del cliente</Label>
                <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Listino da assegnare</Label>
                <Select value={invitePriceList} onValueChange={setInvitePriceList}>
                  <SelectTrigger>
                    <SelectValue placeholder="Listino" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nessuno">Nessuno · prezzi su richiesta</SelectItem>
                    {priceLists.map((item) => (
                      <SelectItem key={item.listNumber} value={String(item.listNumber)}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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

/** Gruppo di campi con titolo, come le sezioni della scheda Danea. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-3 text-sm font-medium">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/** Dato che arriva dal gestionale: sola lettura. */
function ReadField({ label, value }: { label: string; value?: string | null | undefined }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-muted-foreground">{label}</Label>
      <p className="min-h-9 truncate rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
        {value?.trim() ? value : "—"}
      </p>
    </div>
  );
}

/** Campi Danea riconosciuti e conservati, divisi per scheda. */
function ExtraFields({
  record,
  group,
}: {
  record: CustomerRecord;
  group: "commerciale" | "varie";
}) {
  const entries = Object.entries(record.danea_extra ?? {}).filter(
    ([label, value]) => value && DANEA_EXTRA_GROUP_BY_LABEL[label] === group,
  );
  if (!entries.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map(([label, value]) => (
        <ReadField key={label} label={label} value={String(value)} />
      ))}
    </div>
  );
}

/** Colonne del file senza collocazione prevista: conservate e sempre visibili. */
function OtherDaneaData({ record }: { record: CustomerRecord }) {
  const extra = Object.entries(record.danea_extra ?? {}).filter(
    ([label, value]) => value && !DANEA_EXTRA_GROUP_BY_LABEL[label],
  );
  if (!extra.length) return null;
  return (
    <details className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">Altri dati (Danea)</summary>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {extra.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="truncate text-sm">{String(value)}</dd>
          </div>
        ))}
      </dl>
    </details>
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
