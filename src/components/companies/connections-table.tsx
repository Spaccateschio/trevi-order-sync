import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Relation } from "@/hooks/use-identity";
import type { RelationSide } from "@/components/companies/relation-card";

export type ConnectionRow = {
  key: string;
  relation: Relation;
  side: RelationSide;
  bothWays: boolean;
  partnerName: string;
  relationshipLabel: string;
  statusLabel: string;
  statusTone: "attivo" | "attesa" | "sospeso" | "chiuso";
  mySideLabel: string;
};

const toneClass: Record<ConnectionRow["statusTone"], string> = {
  attivo: "bg-success/15 text-success",
  attesa: "bg-warning/15 text-warning",
  sospeso: "bg-destructive/10 text-destructive",
  chiuso: "bg-muted text-muted-foreground",
};

function StatusBadge({ row }: { row: ConnectionRow }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${toneClass[row.statusTone]}`}
    >
      {row.statusLabel}
    </span>
  );
}

type Props = {
  rows: ConnectionRow[];
  onOpen: (row: ConnectionRow) => void;
};

export function ConnectionsTable({ rows, onOpen }: Props) {
  if (!rows.length) {
    return (
      <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Nessun collegamento in questo elenco. Usa Cerca azienda o Invita partner.
      </p>
    );
  }

  return (
    <>
      {/* Desktop e tablet: tabella compatta, riga interamente cliccabile. */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Azienda</TableHead>
              <TableHead>Rapporto</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Mio lato</TableHead>
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
                <TableCell className="py-2 font-medium">{row.partnerName}</TableCell>
                <TableCell className="py-2 text-muted-foreground">{row.relationshipLabel}</TableCell>
                <TableCell className="py-2">
                  <StatusBadge row={row} />
                </TableCell>
                <TableCell className="py-2 text-muted-foreground">{row.mySideLabel}</TableCell>
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
            className="flex w-full flex-col gap-1 rounded-xl border border-border bg-card p-3 text-left shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-display text-sm font-semibold">
                {row.partnerName}
              </span>
              <StatusBadge row={row} />
            </div>
            <span className="text-sm text-muted-foreground">
              {row.relationshipLabel} · mio lato: {row.mySideLabel}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
