/** Readiness belongs to the current purchase, never to previous orders or receipts. */
export function generationEntryState(input: {
  fetching: boolean;
  hasUnconfirmedDrafts: boolean;
  missingQuantityCount: number;
}): "wait" | "drafts" | "review" {
  if (input.fetching) return "wait";
  if (input.hasUnconfirmedDrafts) return "drafts";
  // Missing quantities are handled only by an explicit action in the review.
  return "review";
}

export function initialGenerationStep(_mode: "genera" | "bozze"): "fornitori" {
  return "fornitori";
}

export function shoppingReadyState(list: { status: string } | null, archiveId: string) {
  return {
    showProducts: Boolean(list || archiveId),
    canPrepare: list ? list.status === "aperta" : Boolean(archiveId),
    ordinaryPreview: !list && Boolean(archiveId),
  };
}

/** Called only by an explicit save; simultaneous cards share the same creation. */
export function resolveOrdinaryList(
  activeId: string | null,
  flight: { current: Promise<string | null> | null },
  create: () => Promise<string | null>,
): Promise<string | null> {
  if (activeId) return Promise.resolve(activeId);
  if (!flight.current) {
    flight.current = create().finally(() => { flight.current = null; });
  }
  return flight.current;
}