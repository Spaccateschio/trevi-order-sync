/**
 * «Conferma tutto»: il database (confirm_all_inventory_drafts) conferma ogni bozza con i controlli
 * della conferma singola; le card non confermabili restano bozze. Qui solo il riepilogo da mostrare.
 */
export type ConfirmAllResult = {
  confirmed: number;
  skipped: { label: string; reason: string }[];
};

export function confirmAllSummary(result: ConfirmAllResult): { kind: "empty" | "done" | "partial"; message: string } {
  if (result.confirmed === 0 && result.skipped.length === 0) {
    return { kind: "empty", message: "Nessuna bozza da confermare" };
  }
  if (result.skipped.length === 0) {
    return { kind: "done", message: `${result.confirmed} quantità confermate` };
  }
  const names = result.skipped.slice(0, 3).map((s) => s.label).join(", ");
  return {
    kind: "partial",
    message: `${result.skipped.length} non confermate: ${names}${result.skipped.length > 3 ? "…" : ""}`,
  };
}
