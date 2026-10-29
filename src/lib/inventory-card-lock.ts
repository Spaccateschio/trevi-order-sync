export function inventoryCardLocked(confirmed: boolean, unlocked: boolean, cycleLocked: boolean, correcting: boolean) {
  return cycleLocked ? !correcting : confirmed && !unlocked;
}

export function afterInventoryCardSave(unlocked: boolean, succeeded: boolean) {
  return succeeded ? false : unlocked;
}

export function canEditInventoryCard(locked: boolean, pending: boolean, _unitMissing: boolean) {
  return !locked && !pending;
}

/** Reopening changes presentation only; the saved observation remains authoritative. */
export function inventoryCardEditorState(confirmed: boolean, locked: boolean, draft: string, savedQuantity: string) {
  return {
    confirmedAppearance: confirmed && locked,
    value: confirmed && locked ? savedQuantity : draft,
    placeholder: "",
  };
}
