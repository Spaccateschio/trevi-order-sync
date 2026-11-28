/** Cella CSV quotata e neutralizzata: i valori che iniziano con = + - @ tab o a capo non diventano formule nei fogli di calcolo. */
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
