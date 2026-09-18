import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Store } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Relation } from "@/hooks/use-identity";
import type { RelationSide } from "@/components/companies/relation-card";

export type ConnectionRow = {
  key: string;
  relation: Relation;
  side: RelationSide;
  bothWays: boolean;
  partnerName: string;
  partnerVat: string | null;
  partnerPlace: string | null;
  relationshipLabel: string;
  statusLabel: string;
  statusTone: "attivo" | "attesa" | "sospeso" | "chiuso";
  mySideEnabled: boolean;
  /** Lato del partner: sola lettura, ognuno gestisce soltanto il proprio. */
  partnerSideEnabled: boolean;
  lastActivity: string | null;
};

const statusTone: Record<ConnectionRow["statusTone"], string> = {
  attivo: "bg-success/15 text-success",
  attesa: "bg-warning/20 text-warning-foreground",
  sospeso: "bg-destructive/10 text-destructive",
  chiuso: "bg-muted text-muted-foreground",
};

const relationTone: Record<string, string> = {
  "Io vendo a": "bg-success/12 text-success",
  "Io compro da": "bg-primary/12 text-primary",
  Entrambi: "bg-accent/40 text-accent-foreground",
};

export function StatusPill({ row }: { row: ConnectionRow }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusTone[row.statusTone]}`}
    >
      {row.statusLabel}
    </span>
  );
}

export function RelationPill({ label }: { label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        relationTone[label] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}

export function CompanyAvatar({ className = "size-9" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground ${className}`}
    >
      <Store className="size-4" />
    </span>
  );
}

function formatDay(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Colonne ordinabili della tabella. */
type SortKey = "azienda" | "rapporto" | "stato" | "mio" | "partner" | "ultima";
type Sort = { key: SortKey; dir: "asc" | "desc" };

function compareRows(a: ConnectionRow, b: ConnectionRow, key: SortKey): number {
  switch (key) {
    case "azienda":
      return a.partnerName.localeCompare(b.partnerName, "it");
    case "rapporto":
      return a.relationshipLabel.localeCompare(b.relationshipLabel, "it");
    case "stato":
      return a.statusLabel.localeCompare(b.statusLabel, "it");
    case "mio":
      return Number(a.mySideEnabled) - Number(b.mySideEnabled);
    case "partner":
      return Number(a.partnerSideEnabled) - Number(b.partnerSideEnabled);
    case "ultima":
      return (
        (a.lastActivity ? Date.parse(a.lastActivity) : 0) -
        (b.lastActivity ? Date.parse(b.lastActivity) : 0)
      );
  }
}

function SortHead({
  label,
  k,
  sort,
  onSort,
}: {
  label: string;
  k: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(k)}
        aria-label={`Ordina per ${label}`}
        className="inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground"
      >
        {label}
        <Icon className={`size-3.5 ${active ? "text-foreground" : "text-muted-foreground/60"}`} />
      </button>
    </TableHead>
  );
}

/** Numeri di pagina con puntini di sospensione per elenchi lunghi. */
function pageItems(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = [1, 2, current - 1, current, current + 1, total - 1, total].filter(
    (n) => n >= 1 && n <= total,
  );
  const list = [...new Set(wanted)].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const n of list) {
    if (n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}

type Props = {
  rows: ConnectionRow[];
  canManage: boolean;
  onOpen: (row: ConnectionRow) => void;
  onToggleSide: (row: ConnectionRow, enabled: boolean) => void;
};

export function ConnectionsTable({ rows, canManage, onOpen, onToggleSide }: Props) {
  const [sort, setSort] = useState<Sort>({ key: "azienda", dir: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => compareRows(a, b, sort.key) * (sort.dir === "asc" ? 1 : -1));
    return copy;
  }, [rows, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(key: SortKey) {
    setPage(1);
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  if (!rows.length) {
    return (
      <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Nessun collegamento in questo elenco. Usa Cerca azienda o Invita partner.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Desktop e tablet: tabella gestionale, riga interamente cliccabile. */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <SortHead label="Azienda" k="azienda" sort={sort} onSort={toggleSort} />
              <SortHead label="Rapporto" k="rapporto" sort={sort} onSort={toggleSort} />
              <SortHead label="Stato" k="stato" sort={sort} onSort={toggleSort} />
              <SortHead label="Mio lato" k="mio" sort={sort} onSort={toggleSort} />
              <SortHead label="Lato partner" k="partner" sort={sort} onSort={toggleSort} />
              <SortHead label="Ultima attività" k="ultima" sort={sort} onSort={toggleSort} />
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => (
              <TableRow
                key={row.key}
                tabIndex={0}
                role="button"
                aria-label={`Apri il collegamento con ${row.partnerName}`}
                className="cursor-pointer"
                onClick={() => onOpen(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(row);
                  }
                }}
              >
                <TableCell className="py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <CompanyAvatar />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.partnerName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[row.partnerVat ? `P.IVA ${row.partnerVat}` : null, row.partnerPlace]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-2.5">
                  <RelationPill label={row.relationshipLabel} />
                </TableCell>
                <TableCell className="py-2.5">
                  <StatusPill row={row} />
                </TableCell>
                <TableCell className="py-2.5" onClick={(event) => event.stopPropagation()}>
                  <span className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={row.mySideEnabled}
                      disabled={!canManage || row.relation.status !== "attivo"}
                      aria-label={`Il mio lato con ${row.partnerName}`}
                      onCheckedChange={(value) => onToggleSide(row, value)}
                    />
                    <span className="text-muted-foreground">
                      {row.mySideEnabled ? "Attivo" : "Spento"}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="py-2.5">
                  {/* Doppio consenso: il lato del partner si vede ma non si tocca. */}
                  <span
                    className="flex items-center gap-2 text-sm"
                    title="Gestito dall'azienda partner"
                  >
                    <Switch
                      checked={row.partnerSideEnabled}
                      disabled
                      aria-label={`Lato di ${row.partnerName}`}
                    />
                    <span className="text-muted-foreground">
                      {row.partnerSideEnabled ? "Attivo" : "Spento"}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="py-2.5 text-sm text-muted-foreground">
                  {formatDay(row.lastActivity)}
                </TableCell>
                <TableCell className="py-2.5 text-muted-foreground">
                  <ChevronRight className="size-4" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Smartphone: una card cliccabile per collegamento. */}
      <div className="space-y-2 md:hidden">
        {pageRows.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => onOpen(row)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm"
          >
            <CompanyAvatar />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-sm font-semibold">
                {row.partnerName}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                <RelationPill label={row.relationshipLabel} />
                <StatusPill row={row} />
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>

      {/* Dimensione pagina e navigazione, in stile gestionale. */}
      {sorted.length > 10 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Mostra
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[74px]" aria-label="Risultati per pagina">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            risultati
          </div>
          {totalPages > 1 ? (
            <nav className="flex items-center gap-1" aria-label="Pagine dell'elenco">
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                disabled={safePage === 1}
                aria-label="Pagina precedente"
                onClick={() => setPage(safePage - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              {pageItems(safePage, totalPages).map((item, index) =>
                item === "…" ? (
                  <span key={`dots-${index}`} className="px-1 text-sm text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Button
                    key={item}
                    size="icon"
                    variant={item === safePage ? "default" : "ghost"}
                    className="size-8"
                    aria-current={item === safePage ? "page" : undefined}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </Button>
                ),
              )}
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                disabled={safePage === totalPages}
                aria-label="Pagina successiva"
                onClick={() => setPage(safePage + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </nav>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
