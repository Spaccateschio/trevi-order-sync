export type SupplierOrderIssue = {
  item_id: string;
  name: string;
  status: string;
  remaining: number | null;
};

/** Spiega perché una riga della Lista non compare tra gli ordini pronti. */
export function supplierOrderIssueReason(issue: Pick<SupplierOrderIssue, "status">) {
  if (issue.status === "da_assegnare") return "Quantità salvata, ma fornitore o quota da assegnare sulla card.";
  if (issue.status === "parziale") return "Una parte della quantità non è ancora assegnata a un fornitore.";
  if (issue.status === "da_verificare") return "U.M. di acquisto o conversione da verificare sulla card.";
  return "Quantità mancante: inseriscila e confermala dalla card.";
}
