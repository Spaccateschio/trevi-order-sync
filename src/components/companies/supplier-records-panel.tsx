import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AddressManager } from "@/components/companies/address-manager";
import { SupplierImportDialog } from "@/components/companies/supplier-import-dialog";
import { SupplierPointsManager } from "@/components/companies/supplier-points-manager";
import { SupplierProductsManager } from "@/components/products/supplier-products-manager";
import { DeliveryDaysPicker } from "@/components/suppliers/delivery-days-picker";
import { DEFAULT_SCHEDULE, toSchedule, type DeliverySchedule } from "@/lib/delivery-schedule";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useIdentity } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";
import { DANEA_EXTRA_GROUP_BY_LABEL } from "@/lib/customer-import";
import { fetchDaneaArchives } from "@/lib/price-lists";
import { linkStatusOf } from "@/lib/relation-link-status";
import {
  SUPPLIER_COLUMNS,
  LOCKED_SUPPLIER_COLUMN,
  loadSupplierColumnWidths,
  loadSupplierColumns,
  moveSupplierColumn,
  saveSupplierColumnWidths,
  saveSupplierColumns,
  supplierMatchesQuery,
  type SupplierColumnKey,
} from "@/lib/supplier-columns";
import {
  downloadSuppliersCsv,
  downloadSuppliersExcel,
  printSuppliers,
} from "@/lib/supplier-export";

/**
 * Anagrafica fornitori dell'azienda che compra.
 * È una scheda mia: resta valida anche se il fornitore non userà mai
 * Trevi Fruit. L'eventuale collegamento B2B aggiunge funzioni, non è un requisito.
 */
export type SupplierRecord = {
  id: string;
  legal_name: string;
  vat_number: string | null;
  vat_normalized: string | null;
  tax_code: string | null;
  email: string | null;
  phone: string | null;
  fax: string | null;
  pec: string | null;
  contact_name: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  province: string | null;
  region: string | null;
  country: string | null;
  sdi_code: string | null;
  sdi_admin_reference: string | null
  payment_terms: string | null;
  bank: string | null;
  our_bank: string | null;
  agent: string | null;
  discounts: string | null;
  credit_limit: string | null;
  internal_reference: string | null;
  notes: string | null;
  danea_extra: Record<string, string> | null;
  status: "attivo" | "disattivato" | "revocato";
  archive_id: string | null;
  delivery_weekdays: number[] | null;
  delivery_month_day: number | null;
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

function toForm(record: SupplierRecord): FormState {
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

export const supplierRecordsQueryKey = ["supplier-records"] as const;

export function SupplierRecordsPanel({
  companyId,
  isAdmin,
}: {
  companyId: string;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: identity } = useIdentity();
  const [editing, setEditing] = useState<SupplierRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteFor, setDeleteFor] = useState<SupplierRecord | null>(null);
  const [deletedOpen, setDeletedOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<SupplierColumnKey[]>(() =>
    loadSupplierColumns(),
  );
  const [sort, setSort] = useState<{ key: SupplierColumnKey; asc: boolean }>({
    key: "legal_name",
    asc: true,
  });
  const [columnWidths, setColumnWidths] = useState<Record<SupplierColumnKey, number>>(() =>
    loadSupplierColumnWidths(),
  );
  const [dragColumn, setDragColumn] = useState<SupplierColumnKey | null>(null);
  const [dropTarget, setDropTarget] = useState<SupplierColumnKey | null>(null);

  const archivesQuery = useQuery({
    queryKey: ["archivi-danea", companyId],
    queryFn: () => fetchDaneaArchives(companyId),
  });

  const recordsQuery = useQuery({
    queryKey: supplierRecordsQueryKey,
    queryFn: async (): Promise<SupplierRecord[]> => {
      const { data, error } = await supabase
        .from("supplier_records")
        .select(
          "id, legal_name, vat_number, vat_normalized, tax_code, email, phone, fax, pec, contact_name, address_line, postal_code, city, province, region, country, sdi_code, sdi_admin_reference, payment_terms, bank, our_bank, agent, discounts, credit_limit, internal_reference, notes, danea_extra, status, archive_id",
        )
        .eq("buyer_company_id", companyId)
        .order("legal_name");
      if (error) throw error;
      return (data ?? []) as SupplierRecord[];
    },
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: supplierRecordsQueryKey });
  }

  const allRecords = recordsQuery.data ?? [];
  const records = allRecords.filter((record) => record.status !== "revocato");
  const deletedRecords = allRecords.filter((record) => record.status === "revocato");

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(record: SupplierRecord) {
    setEditing(record);
    setForm(toForm(record));
    setFormOpen(true);
  }

  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc("manage_supplier_record", {
      _buyer_company_id: companyId,
      _action: editing ? "update" : "create",
      ...(editing ? { _supplier_record_id: editing.id } : {}),
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
    toast.success(editing ? "Fornitore aggiornato." : "Fornitore aggiunto all'anagrafica.");
  }

  async function toggleStatus(record: SupplierRecord) {
    const { error } = await supabase.rpc("manage_supplier_record", {
      _buyer_company_id: companyId,
      _action: record.status === "attivo" ? "deactivate" : "activate",
      _supplier_record_id: record.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    toast.success(record.status === "attivo" ? "Fornitore disattivato." : "Fornitore riattivato.");
  }

  /** Eliminazione morbida: il fornitore sparisce dall'elenco ma i dati restano. */
  async function softDelete(record: SupplierRecord) {
    const { error } = await supabase.rpc("manage_supplier_record_status", {
      _buyer_company_id: companyId,
      _supplier_record_id: record.id,
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
    toast.success("Fornitore eliminato: puoi recuperarlo da “Fornitori eliminati”.");
  }

  async function restoreRecord(record: SupplierRecord) {
    const { error } = await supabase.rpc("manage_supplier_record_status", {
      _buyer_company_id: companyId,
      _supplier_record_id: record.id,
      _action: "restore",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    toast.success("Fornitore ripristinato.");
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const columns = visibleColumns
    .map((key) => SUPPLIER_COLUMNS.find((column) => column.key === key))
    .filter((column): column is (typeof SUPPLIER_COLUMNS)[number] => Boolean(column));

  const filtered = useMemo(() => {
    const list = records.filter((record) => supplierMatchesQuery(record, search));
    const column = SUPPLIER_COLUMNS.find((c) => c.key === sort.key);
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

  function toggleColumn(key: SupplierColumnKey) {
    setVisibleColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key];
      const safe = next.includes(LOCKED_SUPPLIER_COLUMN)
        ? next
        : [...next, LOCKED_SUPPLIER_COLUMN];
      saveSupplierColumns(safe);
      return safe;
    });
  }

  function dropColumn(target: SupplierColumnKey) {
    const source = dragColumn;
    setDragColumn(null);
    setDropTarget(null);
    if (!source || source === target) return;
    setVisibleColumns((prev) => {
      const next = moveSupplierColumn(prev, source, target);
      saveSupplierColumns(next);
      return next;
    });
  }

  function toggleSort(key: SupplierColumnKey) {
    setSort((prev) => (prev.key === key ? { key, asc: !prev.asc } : { key, asc: true }));
  }

  /** Collegamento Trevi Fruit: stessa relazione della pagina Collegamenti, qui in lettura. */
  function relationFor(record: SupplierRecord) {
    return (identity?.relations ?? []).find(
      (r) => r.buyerCompanyId === companyId && r.supplierRecordId === record.id,
    );
  }

  function linkFor(record: SupplierRecord) {
    return linkStatusOf(relationFor(record), false);
  }

  function LinkCell({ record }: { record: SupplierRecord }) {
    const link = linkFor(record);
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

  function RowActions({ record }: { record: SupplierRecord }) {
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
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!isAdmin} onSelect={() => void toggleStatus(record)}>
            {record.status === "attivo" ? "Disattiva" : "Riattiva"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!isAdmin}
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleteFor(record)}
          >
            Elimina fornitore
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function cellContent(column: (typeof SUPPLIER_COLUMNS)[number], record: SupplierRecord) {
    if (column.key === "link") return <LinkCell record={record} />;
    if (column.key === "legal_name") return <span className="font-medium">{record.legal_name}</span>;
    return <span className="text-muted-foreground">{column.value(record) || "—"}</span>;
  }

  function exportContext() {
    return {
      columns,
      records: filtered.filter((record) => selectedIds.has(record.id)),
      linkLabel: (record: SupplierRecord) => linkFor(record).label,
    };
  }

  function resizeColumn(event: React.PointerEvent, key: SupplierColumnKey) {
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
        saveSupplierColumnWidths(current);
        return current;
      });
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  const visibleWeight = columns.reduce((total, column) => total + columnWidths[column.key], 0);
  const columnPercent = (key: SupplierColumnKey) =>
    `${(columnWidths[key] / Math.max(visibleWeight, 1)) * 100}%`;
  const densityClass =
    columns.length >= 12 ? "text-[8px]" : columns.length >= 8 ? "text-[9px]" : "text-[10px]";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap sm:justify-between">
        <h2 className="truncate font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Anagrafica fornitori
        </h2>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => setImportOpen(true)}>
            Importa da Danea
          </Button>
          <Button size="sm" disabled={!isAdmin} onClick={openNew}>
            Nuovo fornitore
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cerca per nome, P.IVA, città o codice"
          className="h-8 w-full max-w-xs text-xs"
          aria-label="Cerca fornitore"
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
            {SUPPLIER_COLUMNS.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.key}
                checked={visibleColumns.includes(column.key)}
                disabled={column.key === LOCKED_SUPPLIER_COLUMN}
                onCheckedChange={() => toggleColumn(column.key)}
                onSelect={(event) => event.preventDefault()}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="ml-auto text-xs text-muted-foreground">
          {filtered.length} fornitori
          {selectedIds.size ? ` · ${selectedIds.size} selezionati` : ""}
        </p>
      </div>

      {selectedIds.size ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-2">
          <p className="text-xs">{selectedIds.size} fornitori selezionati</p>
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
                  printSuppliers(exportContext());
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
              onClick={() => void downloadSuppliersExcel(exportContext())}
            >
              <FileSpreadsheet /> Salva Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => downloadSuppliersCsv(exportContext())}
            >
              <Download /> Salva CSV
            </Button>
          </div>
        </div>
      ) : null}

      {recordsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : !records.length ? (
        <p className="text-sm text-muted-foreground">
          Nessun fornitore in anagrafica: aggiungi il primo con “Nuovo fornitore” oppure importa il
          file dei soggetti da Danea.
        </p>
      ) : !filtered.length ? (
        <p className="text-sm text-muted-foreground">Nessun fornitore corrisponde alla ricerca.</p>
      ) : (
        <>
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
                      aria-label="Seleziona tutti i fornitori filtrati"
                    />
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", column.key);
                        setDragColumn(column.key);
                      }}
                      onDragOver={(event) => {
                        if (!dragColumn) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        if (dropTarget !== column.key) setDropTarget(column.key);
                      }}
                      onDragLeave={() =>
                        setDropTarget((prev) => (prev === column.key ? null : prev))
                      }
                      onDrop={(event) => {
                        event.preventDefault();
                        dropColumn(column.key);
                      }}
                      onDragEnd={() => {
                        setDragColumn(null);
                        setDropTarget(null);
                      }}
                      className={`relative h-8 min-w-0 cursor-grab select-none border-b border-r border-border px-1 text-left font-medium text-muted-foreground active:cursor-grabbing ${
                        dropTarget === column.key && dragColumn !== column.key
                          ? "bg-accent text-accent-foreground"
                          : ""
                      } ${dragColumn === column.key ? "opacity-60" : ""}`}
                      title={`${column.label} — clicca per ordinare, trascina per spostare`}
                      onClick={() => toggleSort(column.key)}
                    >
                      <span className="block truncate">
                        {column.label}
                        {sort.key === column.key ? (sort.asc ? " ▲" : " ▼") : ""}
                      </span>
                      <span
                        role="separator"
                        aria-label={`Ridimensiona ${column.label}`}
                        aria-orientation="vertical"
                        draggable={false}
                        className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize touch-none hover:bg-accent"
                        onPointerDown={(event) => resizeColumn(event, column.key)}
                        onDragStart={(event) => event.preventDefault()}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </th>
                  ))}
                  <th className="h-8 border-b border-border px-1 text-right font-medium text-muted-foreground">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => (
                  <tr
                    key={record.id}
                    className="cursor-pointer odd:bg-muted/20 hover:bg-muted/50"
                    onClick={() => openEdit(record)}
                  >
                    <td
                      className="border-b border-r border-border px-1 py-1"
                      onClick={(event) => event.stopPropagation()}
                    >
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
                          column.key === "link"
                            ? linkFor(record).label
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

      {deletedRecords.length ? (
        <div className="space-y-2 border-t border-border pt-3">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setDeletedOpen((prev) => !prev)}
          >
            Fornitori eliminati ({deletedRecords.length})
          </Button>
          {deletedOpen ? (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {deletedRecords.map((record) => (
                <div key={record.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{record.legal_name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[record.vat_number, [record.city, record.province].filter(Boolean).join(" ")]
                        .filter(Boolean)
                        .join(" · ") || "Nessun dato aggiuntivo"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 text-xs"
                    disabled={!isAdmin}
                    onClick={() => void restoreRecord(record)}
                  >
                    Ripristina
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <AlertDialog open={Boolean(deleteFor)} onOpenChange={(open) => !open && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare “{deleteFor?.legal_name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Il fornitore verrà nascosto dall’elenco, ma i suoi dati non vengono cancellati: potrai
              recuperarlo dal pulsante “Fornitori eliminati” in fondo alla pagina.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteFor && void softDelete(deleteFor)}>
              Elimina fornitore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Dettagli fornitore" : "Nuovo fornitore"}</DialogTitle>
            <DialogDescription>
              La scheda fornitore è tua e resta valida anche se il fornitore non usa Trevi Fruit. I
              dati che arrivano dal gestionale sono in sola lettura.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="anagrafica">
            <TabsList className="flex w-full flex-wrap">
              <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
              <TabsTrigger value="commerciale">Rapporti commerciali</TabsTrigger>
              <TabsTrigger value="varie">Varie</TabsTrigger>
              {editing ? <TabsTrigger value="prodotti">Prodotti forniti</TabsTrigger> : null}
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

              <Section title="Sede">
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
                <Field label="Città" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
                <Field
                  label="Provincia"
                  value={form.province}
                  onChange={(v) => setForm({ ...form, province: v })}
                />
                <ReadField
                  label="Archivio Danea"
                  value={
                    editing
                      ? (archivesQuery.data ?? []).find((a) => a.id === editing.archive_id)?.name ??
                        "Non assegnato"
                      : null
                  }
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
                    <ReadField label="Fido" value={editing.credit_limit} />
                    <ReadField label="Agente" value={editing.agent} />
                    <ReadField label="Pagamento" value={editing.payment_terms} />
                    <ReadField label="Coordinate bancarie" value={editing.bank} />
                    <ReadField label="Nostra banca" value={editing.our_bank} />
                    <ReadField label="Collegamento Trevi Fruit" value={linkFor(editing).label} />
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

            {editing ? (
              <TabsContent value="prodotti" className="mt-4">
                <SupplierProductsManager
                  companyId={companyId}
                  supplierRecordId={editing.id}
                  supplierArchiveId={editing.archive_id}
                  isAdmin={isAdmin}
                />
              </TabsContent>
            ) : null}
          </Tabs>

          {editing ? (
            <div className="mt-4 border-t border-border pt-4">
              <AddressManager
                owner={{ supplierRecordId: editing.id }}
                isAdmin={isAdmin}
                showPartnerVisibility={false}
              />
            </div>
          ) : null}
          {editing ? (
            <div className="mt-4 border-t border-border pt-4">
              <SupplierPointsManager supplierRecordId={editing.id} isAdmin={isAdmin} />
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

      <SupplierImportDialog
        companyId={companyId}
        existing={records.map((record) => ({
          id: record.id,
          legal_name: record.legal_name,
          vat_normalized: record.vat_normalized,
          tax_code: record.tax_code,
          internal_reference: record.internal_reference,
          archive_id: record.archive_id,
        }))}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={refresh}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-3 text-sm font-medium">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

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

function ExtraFields({
  record,
  group,
}: {
  record: SupplierRecord;
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

function OtherDaneaData({ record }: { record: SupplierRecord }) {
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
  const id = `sr-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
