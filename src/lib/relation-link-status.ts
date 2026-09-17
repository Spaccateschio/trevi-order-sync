/**
 * Stato del collegamento Trevi Fruit di un cliente d'anagrafica.
 *
 * Unico punto di calcolo condiviso da Clienti (indicatore in sola lettura) e
 * Collegamenti (gestione del rapporto): la relazione resta una sola riga in
 * supplier_customer_relations, qui non si duplica nessun dato.
 */
import { isRelationOperational, type Relation } from "@/hooks/use-identity";

export type LinkStatusKey = "assente" | "in_attesa" | "attivo" | "sospeso" | "chiuso";

export type LinkStatus = {
  key: LinkStatusKey;
  label: string;
  /** Classe del pallino: sempre token del tema, mai colori fissi. */
  dotClassName: string;
};

const STATUS: Record<LinkStatusKey, LinkStatus> = {
  assente: {
    key: "assente",
    label: "Non collegato",
    dotClassName: "bg-muted-foreground/50",
  },
  in_attesa: {
    key: "in_attesa",
    label: "In attesa",
    dotClassName: "bg-warning",
  },
  attivo: {
    key: "attivo",
    label: "Collegato",
    dotClassName: "bg-success",
  },
  sospeso: {
    key: "sospeso",
    label: "Sospeso",
    dotClassName: "bg-destructive/60",
  },
  chiuso: {
    key: "chiuso",
    label: "Collegamento chiuso",
    dotClassName: "bg-destructive",
  },
};

export function linkStatusOf(
  relation: Relation | null | undefined,
  hasPendingInvitation: boolean,
): LinkStatus {
  if (!relation) {
    return hasPendingInvitation
      ? { ...STATUS.in_attesa, label: "Invito inviato" }
      : STATUS.assente;
  }
  if (relation.status === "in_attesa") return { ...STATUS.in_attesa, label: "In attesa di risposta" };
  if (relation.status === "rifiutato") return { ...STATUS.chiuso, label: "Richiesta rifiutata" };
  if (relation.status === "revocato") return STATUS.chiuso;
  if (isRelationOperational(relation)) return STATUS.attivo;
  return STATUS.sospeso;
}
