/** Presentation only: no quantities, persistence or permission decisions. */
export function toggleMobileCard(current: string | null, id: string): string | null {
  return current === id ? null : id;
}

export function finishMobileCard(current: string | null, id: string, succeeded: boolean): string | null {
  return succeeded && current === id ? null : current;
}

export function useCompactCard(width: number, layout: "card" | "row"): boolean {
  return width < 768 && layout === "card";
}