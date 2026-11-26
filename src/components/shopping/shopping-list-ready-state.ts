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

/** Generation and delivery are separate: even an unsent order is preserved work. */
export function generationCompleted(outcomes: readonly { kind: string }[]): boolean {
  return outcomes.length > 0 && outcomes.every((outcome) =>
    ["inviato", "da_condividere", "errore_invio", "acquisto_diretto"].includes(outcome.kind),
  );
}

export function shoppingReadyState(list: { status: string } | null, archiveId: string) {
  return {
    showProducts: Boolean(list || archiveId),
    canPrepare: list ? list.status === "aperta" : Boolean(archiveId),
    ordinaryPreview: !list && Boolean(archiveId),
  };
}

/** Il prossimo acquisto e le liste aperte accettano bozze; confermate e Storico no. */
export function shoppingListAcceptsDrafts(list: { status: string } | null) {
  return !list || list.status === "aperta";
}

export function canClearShoppingQuantities(list: { status: string } | null, productsAvailable: boolean) {
  return shoppingListAcceptsDrafts(list) && productsAvailable;
}

/** Reset local quantity drafts only; units and selected destinations are preserved. */
export function clearCatalogQuantityDrafts<T extends { raw: string; dest?: { quotas?: { quantity: string }[] } }>(drafts: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(drafts).map(([key, draft]) => [key, {
    ...draft, raw: "",
    ...(draft.dest?.quotas ? { dest: { ...draft.dest, quotas: draft.dest.quotas.map((quota) => ({ ...quota, quantity: "" })) } } : {}),
  }]));
}

export function canLeaveShoppingDrafts(list: { status: string } | null, hasUnconfirmed: boolean) {
  return !shoppingListAcceptsDrafts(list) || !hasUnconfirmed;
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