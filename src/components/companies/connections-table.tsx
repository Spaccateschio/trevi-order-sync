import { ChevronRight, Store } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
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

type Props = {
  rows: ConnectionRow[];
  canManage: boolean;
  onOpen: (row: ConnectionRow) => void;
  onToggleSide: (row: ConnectionRow, enabled: boolean) => void;
};

export function ConnectionsTable({ rows, canManage, onOpen, onToggleSide }: Props) {
  if (!rows.length) {
    return (
      <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Nessun collegamento in questo elenco. Usa Cerca azienda o Invita partner.
      </p>
    );
  }

  return (
    <>
      {/* Desktop e tablet: tabella gestionale, riga interamente cliccabile. */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Azienda</TableHead>
              <TableHead>Rapporto</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Mio lato</TableHead>
              <TableHead>Ultima attività</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
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
                        {row.partnerVat ? `P.IVA ${row.partnerVat}` : row.partnerPlace ?? "—"}
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
                  <Switch
                    checked={row.mySideEnabled}
                    disabled={!canManage || row.relation.status !== "attivo"}
                    aria-label={`Il mio lato con ${row.partnerName}`}
                    onCheckedChange={(value) => onToggleSide(row, value)}
                  />
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
        {rows.map((row) => (
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
    </>
  );
}
