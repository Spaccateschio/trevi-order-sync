import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fetchActivePriceLists } from "@/lib/price-lists";
import {
  IMPORT_FIELD_LABELS,
  buildPreview,
  parseCustomerFile,
  remap,
  resolvePriceListNumber,
  type ExistingCustomer,
  type ImportField,
  type ParsedFile,
  type PreviewItem,
} from "@/lib/customer-import";

/**
 * Importazione clienti da un'esportazione Danea.
 * L'anteprima è sempre obbligatoria: nessuna riga viene salvata prima
 * della conferma. L'importazione non crea account né rapporti commerciali.
 */
const FIELD_OPTIONS = Object.keys(IMPORT_FIELD_LABELS) as ImportField[];
const IGNORE = "__ignora__";

export function CustomerImportDialog({
  companyId,
  existing,
  open,
  onOpenChange,
  onImported,
}: {
  companyId: string;
  existing: ExistingCustomer[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  /** Listini dell'azienda: servono per riconoscere il nome scritto nel file. */
  const priceListsQuery = useQuery({
    queryKey: ["listini-attivi", companyId],
    queryFn: () => fetchActivePriceLists(companyId),
  });
  const priceLists = priceListsQuery.data ?? [];

  function reset() {
    setParsed(null);
    setPreview([]);
    setSelected(new Set());
    setSummary(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function applyPreview(file: ParsedFile) {
    const items = buildPreview(file.customers, existing);
    setPreview(items);
    setSelected(
      new Set(items.filter((item) => item.outcome !== "skip").map((item) => item.row.rowIndex)),
    );
  }

  async function handleFile(file: File) {
    setSummary(null);
    try {
      const result = await parseCustomerFile(file);
      if (!result.customers.length) {
        toast.error("Nel file non ho trovato clienti da importare.");
        return;
      }
      setParsed(result);
      applyPreview(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Non riesco a leggere questo file.");
    }
  }

  function changeMapping(column: number, field: ImportField | null) {
    if (!parsed) return;
    const mapping = parsed.mapping.map((current, index) => {
      if (index === column) return field;
      return field && current === field ? null : current;
    });
    const next = remap(parsed, mapping);
    setParsed(next);
    applyPreview(next);
  }

  function toggleRow(rowIndex: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }

  async function confirmImport() {
    const rows = preview.filter(
      (item) => item.outcome !== "skip" && selected.has(item.row.rowIndex),
    );
    if (!rows.length) {
      toast.error("Seleziona almeno un cliente da importare.");
      return;
    }
    setBusy(true);
    let created = 0;
    let updated = 0;
    const failed: string[] = [];

    for (const item of rows) {
      const row = item.row;
      const priceList = resolvePriceListNumber(row.price_list, priceLists);
      const extraEntries = Object.entries(row.extra).filter(([, value]) => value);
      const payload = {
        _seller_company_id: companyId,
        _action: item.outcome === "update" ? "update" : "create",
        ...(item.existingId ? { _customer_record_id: item.existingId } : {}),
        _legal_name: row.legal_name,
        _vat_number: row.vat_number,
        _tax_code: row.tax_code,
        _email: row.email,
        _phone: row.phone,
        _address_line: row.address_line,
        _postal_code: row.postal_code,
        _city: row.city,
        _province: row.province,
        _internal_reference: row.internal_reference,
        ...(row.notes ? { _notes: row.notes } : {}),
        _region: row.region,
        _country: row.country,
        _sdi_code: row.sdi_code,
        _sdi_admin_reference: row.sdi_admin_reference,
        _contact_name: row.contact_name,
        _fax: row.fax,
        _pec: row.pec,
        _discounts: row.discounts,
        _credit_limit: row.credit_limit,
        _agent: row.agent,
        _payment_terms: row.payment_terms,
        _bank: row.bank,
        _our_bank: row.our_bank,
        ...(extraEntries.length ? { _danea_extra: Object.fromEntries(extraEntries) } : {}),
        ...(priceList ? { _price_list_number: priceList } : {}),
      };
      const { error } = await supabase.rpc("manage_customer_record", payload);
      if (error) {
        failed.push(`${row.legal_name}: ${error.message}`);
        continue;
      }
      if (item.outcome === "update") updated += 1;
      else created += 1;
    }

    setBusy(false);
    await onImported();
    setSummary(
      [
        `Clienti aggiunti: ${created}`,
        `Clienti aggiornati: ${updated}`,
        failed.length ? `Non importati: ${failed.length}` : null,
        ...failed.slice(0, 5),
      ]
        .filter(Boolean)
        .join("\n"),
    );
    setParsed(null);
    setPreview([]);
    setSelected(new Set());
  }

  const unresolvedPriceLists = Array.from(
    new Set(
      preview
        .filter((item) => item.outcome !== "skip" && item.row.price_list)
        .filter((item) => resolvePriceListNumber(item.row.price_list, priceLists) === null)
        .map((item) => item.row.price_list),
    ),
  );

  const groups = {
    create: preview.filter((item) => item.outcome === "create"),
    update: preview.filter((item) => item.outcome === "update"),
    skip: preview.filter((item) => item.outcome === "skip"),
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) reset();
        onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importa clienti da Danea</DialogTitle>
          <DialogDescription>
            Carica l’esportazione dei soggetti (Excel, CSV o XML). Vedrai un’anteprima prima di
            salvare: nessun account viene creato e nessun collegamento commerciale nasce da qui.
          </DialogDescription>
        </DialogHeader>

        {summary ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium">Importazione completata</p>
            <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{summary}</pre>
          </div>
        ) : null}

        <div className="grid gap-1.5">
          <Label htmlFor="customer-import-file">File Danea</Label>
          <input
            id="customer-import-file"
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.ods,.csv,.txt,.xml"
            className="block w-full cursor-pointer rounded-md border border-border bg-background p-2 text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </div>

        {parsed && parsed.headers.length ? (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Colonne del file</p>
            <p className="text-xs text-muted-foreground">
              Tutte le colonne del file vengono importate. Quelle senza un campo dedicato finiscono
              in “Altri dati (Danea)” nella scheda del cliente.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {parsed.headers.map((header, column) => (
                <div key={`${header}-${column}`} className="grid gap-1">
                  <span className="truncate text-xs text-muted-foreground">
                    {header || `Colonna ${column + 1}`}
                  </span>
                  <Select
                    value={parsed.mapping[column] ?? IGNORE}
                    onValueChange={(value) =>
                      changeMapping(column, value === IGNORE ? null : (value as ImportField))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={IGNORE}>Altri dati (Danea)</SelectItem>
                      {FIELD_OPTIONS.map((field) => (
                        <SelectItem key={field} value={field}>
                          {IMPORT_FIELD_LABELS[field]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {unresolvedPriceLists.length ? (
          <div className="space-y-1 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Listini non riconosciuti</p>
            <p className="text-xs text-muted-foreground">
              Questi nomi di listino non esistono nella tua azienda: il cliente viene importato
              senza listino e i prezzi restano su richiesta finché non lo assegni.
            </p>
            <p className="text-sm text-muted-foreground">{unresolvedPriceLists.join(", ")}</p>
          </div>
        ) : null}

        {preview.length ? (
          <div className="space-y-3">
            <PreviewGroup
              title={`Da aggiungere (${groups.create.length})`}
              items={groups.create}
              selected={selected}
              onToggle={toggleRow}
            />
            <PreviewGroup
              title={`Già presenti, da aggiornare (${groups.update.length})`}
              items={groups.update}
              selected={selected}
              onToggle={toggleRow}
            />
            {groups.skip.length ? (
              <div className="space-y-1 rounded-lg border border-border p-3">
                <p className="text-sm font-medium">Righe scartate ({groups.skip.length})</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {groups.skip.map((item) => (
                    <li key={item.row.rowIndex}>
                      Riga {item.row.rowIndex}: {item.row.legal_name || "senza nome"} — {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Chiudi
          </Button>
          <Button disabled={busy || !preview.length} onClick={confirmImport}>
            {busy ? "Importazione…" : `Importa ${selected.size} clienti`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewGroup({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: PreviewItem[];
  selected: Set<number>;
  onToggle: (rowIndex: number) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-medium">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.row.rowIndex} className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={selected.has(item.row.rowIndex)}
              onCheckedChange={() => onToggle(item.row.rowIndex)}
              aria-label={`Includi ${item.row.legal_name}`}
            />
            <div className="min-w-0">
              <p className="truncate font-medium">{item.row.legal_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[
                  item.row.vat_number ? `P.IVA ${item.row.vat_number}` : null,
                  [item.row.city, item.row.province].filter(Boolean).join(" ") || null,
                  item.row.email || null,
                  item.existingName ? `già in anagrafica: ${item.existingName}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
