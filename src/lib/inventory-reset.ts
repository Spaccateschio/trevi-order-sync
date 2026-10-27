/**
 * «Svuota» with an open inventory clears drafts AND confirmed counts of that session
 * (reset_open_inventory_count, admin-only, DB guards); a completed locked cycle uses the reopen flow.
 */
export function inventoryResetAction(sessionActive: boolean, cycleLocked: boolean) {
  return !sessionActive && cycleLocked ? "reopen" : "clear_open";
}

export function inventoryReopenQueryKeys(companyId: string, archiveId: string | null, sessionId: string) {
  return [
    ["inventory-general-session", companyId, archiveId],
    ["inventory-last-closed", companyId, archiveId],
    ["inventory-rows", sessionId],
    ["inventory-progress", sessionId],
    ["inventory-count-drafts", sessionId],
  ];
}
