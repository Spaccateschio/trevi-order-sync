import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { activeCompany, companySells, hasRole, useIdentity } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";
import { analyzeDaneaFile, importDaneaFile } from "@/lib/danea.functions";

export const Route = createFileRoute("/_authenticated/vendite_/prodotti")({
  head: () => ({
    meta: [
      { title: "Prodotti da Danea — Trevi Fruit" },
      {
        name: "description",
        content:
          "Elenco unico dei prodotti ricevuti da Danea Easyfatt: ricerca, filtri, dettaglio e importazione manuale del file.",
      },
      { property: "og:title", content: "Prodotti da Danea — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "Elenco unico dei prodotti ricevuti da Danea Easyfatt: ricerca, filtri, dettaglio e importazione manuale del file.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProdottiPage,
});

const PAGE_SIZE = 50;

type ProductRow = {
  id: string;
  archive_id: string;
  code: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  danea_um: string | null;
  size_um: string | null;
  weight_um: string | null;
  vat_perc: number | null;
  vat_code: string | null;
  vat_description: string | null;
  publish_status: "pubblicato" | "non_pubblicato";
  danea_internal_id: string | null;
  notes: string | null;
  image_file_name: string | null;
  image_folder: string | null;
  supplier_code: string | null;
  supplier_name: string | null;
  supplier_product_code: string | null;
  last_received_at: string;
  product_prices: { list_number: number; net_price: number | null; gross_price: number | null }[];
};

function euro(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}

function ProdottiPage() {
  const { data: identity, isLoading: identityLoading } = useIdentity();
  const company = activeCompany(identity);
  const companyId = company?.companyId ?? null;
  const isAdmin = hasRole(identity, "amministratore");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("tutte");
  const [archiveFilter, setArchiveFilter] = useState("tutti");
  // Danea è il gestionale padrone: per default vediamo solo i prodotti
  // presenti nell'ultimo catalogo inviato.
  const [status, setStatus] = useState("pubblicato");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ProductRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const archivesQuery = useQuery({
    queryKey: ["danea-archivi", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("danea_archives")
        .select("id, name, is_default, status")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const productsQuery = useQuery({
    queryKey: ["prodotti", companyId],
    enabled: Boolean(companyId),
    // Gli invii da Danea arrivano dal server: ricontrolliamo spesso così
    // l'elenco riflette subito l'ultimo catalogo ricevuto.
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, archive_id, code, description, category, subcategory, danea_um, size_um, weight_um, vat_perc, vat_code, vat_description, publish_status, danea_internal_id, notes, image_file_name, image_folder, supplier_code, supplier_name, supplier_product_code, last_received_at, product_prices(list_number, net_price, gross_price)",
        )
        .eq("company_id", companyId!)
        .order("code");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ProductRow[];
    },
  });

  const priceListsQuery = useQuery({
    queryKey: ["danea-listini", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("danea_price_lists")
        .select("list_number, danea_name, display_name")
        .eq("company_id", companyId!)
        .order("list_number");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const costsQuery = useQuery({
    queryKey: ["danea-costi", companyId, selected?.id],
    enabled: Boolean(companyId && selected && isAdmin),
    queryFn: async () => {
      const { data } = await supabase
        .from("product_supplier_costs")
        .select("supplier_name, supplier_code, supplier_product_code, supplier_net_price, supplier_gross_price, received_at")
        .eq("product_id", selected!.id)
        .maybeSingle();
      return data;
    },
  });

  const listName = (listNumber: number) => {
    const row = priceListsQuery.data?.find((l) => l.list_number === listNumber);
    return row?.display_name ?? row?.danea_name ?? `Listino ${listNumber}`;
  };

  const allProducts = productsQuery.data ?? [];

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of allProducts) if (p.category) set.add(p.category);
    return [...set].sort((a, b) => a.localeCompare(b, "it"));
  }, [allProducts]);

  const archives = archivesQuery.data ?? [];
  const archiveNameById = new Map(archives.map((a) => [a.id, a.name]));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allProducts.filter((p) => {
      if (category !== "tutte" && p.category !== category) return false;
      if (archiveFilter !== "tutti" && p.archive_id !== archiveFilter) return false;
      if (status !== "tutti" && p.publish_status !== status) return false;
      if (!term) return true;
      return (
        p.code.toLowerCase().includes(term) || (p.description ?? "").toLowerCase().includes(term)
      );
    });
  }, [allProducts, search, category, status, archiveFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const mainPrice = (p: ProductRow) => {
    const first = [...p.product_prices].sort((a, b) => a.list_number - b.list_number)[0];
    return first ? (first.net_price ?? first.gross_price) : null;
  };

  if (!identityLoading && !companySells(identity)) {
    return (
      <AppShell title="Prodotti" description="Area riservata alle aziende che vendono.">
        <p className="text-sm text-muted-foreground">
          Il profilo di vendita non è attivo per la tua azienda. Un amministratore può attivarlo
          dalla pagina Azienda.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Prodotti"
      description="Tutti i prodotti ricevuti da Danea, dal collegamento diretto o dall'importazione manuale."
    >
      <div className="space-y-4">
        {isAdmin ? (
          <div className="flex justify-end">
            <Button onClick={() => setImportOpen(true)}>Importa da Danea</Button>
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <Input
            placeholder="Cerca per codice o descrizione"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          <Select
            value={category}
            onValueChange={(v) => {
              setCategory(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutte">Tutte le categorie</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="sm:w-44">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pubblicato">Catalogo Danea attuale</SelectItem>
              <SelectItem value="non_pubblicato">Non più inviati da Danea</SelectItem>
              <SelectItem value="tutti">Tutti</SelectItem>
            </SelectContent>
          </Select>
          {archives.length > 1 ? (
            <Select
              value={archiveFilter}
              onValueChange={(v) => {
                setArchiveFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="Archivio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti gli archivi</SelectItem>
                {archives.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          {productsQuery.isLoading
            ? "Caricamento…"
            : status === "pubblicato"
              ? `${filtered.length} prodotti nell'ultimo catalogo ricevuto da Danea`
              : `${filtered.length} prodotti su ${allProducts.length} in archivio`}
        </p>

        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Codice</TableHead>
                <TableHead>Descrizione</TableHead>
                <TableHead className="hidden md:table-cell">Categoria</TableHead>
                <TableHead className="w-16">U.M.</TableHead>
                <TableHead className="w-16">IVA</TableHead>
                <TableHead className="w-28 text-right">Listino 1</TableHead>
                <TableHead className="w-32">Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(p)}
                >
                  <TableCell className="font-mono text-xs">{p.code}</TableCell>
                  <TableCell className="text-sm">{p.description ?? "—"}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {[p.category, p.subcategory].filter(Boolean).join(" / ") || "—"}
                  </TableCell>
                  <TableCell className="text-xs">{p.danea_um ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {p.vat_perc !== null ? `${p.vat_perc}%` : (p.vat_code ?? "—")}
                  </TableCell>
                  <TableCell className="text-right text-sm">{euro(mainPrice(p))}</TableCell>
                  <TableCell>
                    <Badge variant={p.publish_status === "pubblicato" ? "default" : "secondary"}>
                      {p.publish_status === "pubblicato" ? "Pubblicato" : "Non pubblicato"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!productsQuery.isLoading && !visible.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Nessun prodotto. Importa il file Danea oppure invia il catalogo dalla postazione
                    Danea.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {pageCount > 1 ? (
          <div className="flex items-center justify-between text-sm">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Precedenti
            </Button>
            <span className="text-muted-foreground">
              Pagina {currentPage + 1} di {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              Successivi
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.description ?? selected?.code}</DialogTitle>
            <DialogDescription>
              Dati ricevuti da Danea Easyfatt. La modifica dell'anagrafica avviene in Danea.
            </DialogDescription>
          </DialogHeader>

          {selected ? (
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Codice" value={selected.code} />
                <Field label="Identificativo interno" value={selected.danea_internal_id ?? "—"} />
                <Field label="Categoria" value={selected.category ?? "—"} />
                <Field label="Sottocategoria" value={selected.subcategory ?? "—"} />
                <Field label="Unità di misura" value={selected.danea_um ?? "—"} />
                <Field
                  label="IVA"
                  value={
                    selected.vat_perc !== null
                      ? `${selected.vat_perc}% ${selected.vat_description ?? ""}`.trim()
                      : (selected.vat_code ?? "—")
                  }
                />
                <Field
                  label="Stato"
                  value={selected.publish_status === "pubblicato" ? "Pubblicato" : "Non pubblicato"}
                />
                <Field label="Ultimo aggiornamento" value={dateTime(selected.last_received_at)} />
              </dl>

              <section>
                <h3 className="font-display text-sm font-semibold">Listini</h3>
                {selected.product_prices.length ? (
                  <ul className="mt-2 space-y-1">
                    {[...selected.product_prices]
                      .sort((a, b) => a.list_number - b.list_number)
                      .map((price) => (
                        <li key={price.list_number} className="flex justify-between gap-3">
                          <span className="text-muted-foreground">
                            {listName(price.list_number)}
                          </span>
                          <span>
                            {euro(price.net_price)}
                            {price.gross_price !== null ? ` (ivato ${euro(price.gross_price)})` : ""}
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-muted-foreground">Nessun prezzo ricevuto.</p>
                )}
              </section>

              {isAdmin ? (
                <section>
                  <h3 className="font-display text-sm font-semibold">Fornitore e costo</h3>
                  {costsQuery.data ? (
                    <dl className="mt-2 grid grid-cols-2 gap-3">
                      <Field label="Fornitore" value={costsQuery.data.supplier_name ?? "—"} />
                      <Field label="Codice fornitore" value={costsQuery.data.supplier_code ?? "—"} />
                      <Field
                        label="Codice prodotto fornitore"
                        value={costsQuery.data.supplier_product_code ?? "—"}
                      />
                      <Field label="Costo" value={euro(costsQuery.data.supplier_net_price)} />
                    </dl>
                  ) : (
                    <p className="mt-1 text-muted-foreground">
                      {selected.supplier_name
                        ? selected.supplier_name
                        : "Nessun dato fornitore ricevuto."}
                    </p>
                  )}
                </section>
              ) : null}

              <section>
                <h3 className="font-display text-sm font-semibold">Altri dati</h3>
                <dl className="mt-2 grid grid-cols-2 gap-3">
                  <Field label="Note" value={selected.notes ?? "—"} />
                  <Field label="Immagine" value={selected.image_file_name ?? "—"} />
                  <Field label="Cartella immagini" value={selected.image_folder ?? "—"} />
                </dl>
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        companyId={companyId}
        onImported={() => {
          void queryClient.invalidateQueries({ queryKey: ["prodotti", companyId] });
          void queryClient.invalidateQueries({ queryKey: ["danea-listini", companyId] });
        }}
      />
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

type Analysis = Awaited<ReturnType<typeof analyzeDaneaFile>>;

function ImportDialog({
  open,
  onOpenChange,
  companyId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  onImported: () => void;
}) {
  const analyze = useServerFn(analyzeDaneaFile);
  const runImport = useServerFn(importDaneaFile);
  const fileRef = useRef<HTMLInputElement>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const reset = () => {
    setXml(null);
    setFileName(null);
    setAnalysis(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const analyzeMutation = useMutation({
    mutationFn: async () => analyze({ data: { companyId: companyId!, xml: xml! } }),
    onSuccess: (result) => setAnalysis(result),
    onError: (error: Error) => toast.error(error.message),
  });

  const importMutation = useMutation({
    mutationFn: async () => runImport({ data: { companyId: companyId!, xml: xml! } }),
    onSuccess: (result) => {
      toast.success("Importazione Danea completata", {
        description: `Creati ${result.created}, aggiornati ${result.updated}, invariati ${Math.max(
          0,
          result.received - result.created - result.updated,
        )}, depubblicati ${result.unpublished}.`,
      });
      onImported();
      reset();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importa da Danea</DialogTitle>
          <DialogDescription>
            Carica il file XML ottenuto con “Salva su file” di Danea Easyfatt. Viene usato lo stesso
            motore del collegamento diretto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium">1. Seleziona file Danea</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              className="mt-2 w-full text-sm"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                setAnalysis(null);
                if (!file) {
                  setXml(null);
                  setFileName(null);
                  return;
                }
                setFileName(file.name);
                const buffer = await file.arrayBuffer();
                // Lo stesso decodificatore usato dal collegamento diretto vive sul
                // server: qui leggiamo il testo e lasciamo al lettore XML il resto.
                const head = new TextDecoder("utf-8").decode(buffer.slice(0, 200));
                const match = /encoding=["']([^"']+)["']/i.exec(head);
                const encoding = match?.[1]?.toLowerCase() ?? "utf-8";
                try {
                  setXml(new TextDecoder(encoding).decode(buffer));
                } catch {
                  setXml(new TextDecoder("utf-8").decode(buffer));
                }
              }}
            />
            {fileName ? (
              <p className="mt-1 text-xs text-muted-foreground">File scelto: {fileName}</p>
            ) : null}
          </div>

          <div>
            <p className="font-medium">2. Analizza file</p>
            <Button
              className="mt-2"
              variant="outline"
              size="sm"
              disabled={!xml || !companyId || analyzeMutation.isPending}
              onClick={() => analyzeMutation.mutate()}
            >
              {analyzeMutation.isPending ? "Analisi…" : "Analizza file"}
            </Button>

            {analysis ? (
              <div className="mt-3 space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Tipo invio: </span>
                  {analysis.mode === "full" ? "COMPLETO" : "INCREMENTALE"}
                </p>
                <p>
                  <span className="text-muted-foreground">Prodotti trovati: </span>
                  {analysis.received}
                </p>
                <p>
                  <span className="text-muted-foreground">Prodotti nuovi: </span>
                  {analysis.toCreate}
                </p>
                <p>
                  <span className="text-muted-foreground">Prodotti da aggiornare: </span>
                  {analysis.toUpdate}
                </p>
                <p>
                  <span className="text-muted-foreground">Prodotti da depubblicare: </span>
                  {analysis.toUnpublish}
                </p>
                <p>
                  <span className="text-muted-foreground">Listini trovati: </span>
                  {analysis.priceLists.length
                    ? analysis.priceLists.map((l) => l.name).join(", ")
                    : "nessun nome listino"}
                </p>
                <p>
                  <span className="text-muted-foreground">Segnalazioni: </span>
                  {analysis.issues.length ? analysis.issues.length : "nessuna"}
                </p>
                {analysis.issues.length ? (
                  <ul className="ml-4 list-disc text-xs text-muted-foreground">
                    {analysis.issues.slice(0, 5).map((issue, index) => (
                      <li key={index}>
                        {issue.productCode ? `${issue.productCode}: ` : ""}
                        {issue.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {analysis.reconciliationBlocked ? (
                  <p className="text-xs font-medium text-destructive">
                    Invio completo non integro: nessun prodotto verrà depubblicato per assenza.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            <p className="font-medium">3. Conferma importazione</p>
            <p className="text-xs text-muted-foreground">
              Le modifiche vengono applicate solo dopo la conferma.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            disabled={!analysis || importMutation.isPending}
            onClick={() => importMutation.mutate()}
          >
            {importMutation.isPending ? "Importazione…" : "Conferma importazione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
