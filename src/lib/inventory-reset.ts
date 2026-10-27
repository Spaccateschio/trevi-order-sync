/** Draft clearing must never implicitly erase confirmed inventory counts. */
export function inventoryResetAction(sessionActive: boolean, cycleLocked: boolean) {
  return !sessionActive && cycleLocked ? "reopen" : "drafts";
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