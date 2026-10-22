/** Local editing state only: no quantity writes or permission decisions. */
export function unlockSelectedProduct(current: ReadonlySet<string>, id: string): Set<string> {
  return new Set(current).add(id);
}

export function toggleMobileCard(current: string | null, id: string): string | null {
  return current === id ? null : id;
}

export function finishMobileCard(current: string | null, id: string, succeeded: boolean): string | null {
  return succeeded && current === id ? null : current;
}

export function useCompactCard(width: number, layout: "card" | "row"): boolean {
  return width < 768 && layout === "card";
}