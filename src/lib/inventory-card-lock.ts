export function inventoryCardLocked(confirmed: boolean, unlocked: boolean, cycleLocked: boolean, correcting: boolean) {
  return cycleLocked ? !correcting : confirmed && !unlocked;
}

export function afterInventoryCardSave(unlocked: boolean, succeeded: boolean) {
  return succeeded ? false : unlocked;
}

export function canEditInventoryCard(locked: boolean, pending: boolean, unitMissing: boolean) {
  return !locked && !pending && !unitMissing;
}
