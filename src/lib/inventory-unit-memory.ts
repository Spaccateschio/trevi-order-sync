/**
 * U.M. scelta sulle card di inventario, ricordata sul dispositivo per azienda
 * e chiave card (prodotto+ubicazione+fornitore): resta anche con «Rifai
 * inventario» finché l'utente non la cambia. Presentazione locale, mai dati DB.
 */
export function inventoryUnitMemoryKey(companyId: string) {
  return `trevi:inventario:um-card:${companyId}`;
}

export function loadInventoryUnitMemory(storage: Pick<Storage, "getItem"> | null | undefined, companyId: string): Record<string, string> {
  try {
    const raw = storage?.getItem(inventoryUnitMemoryKey(companyId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveInventoryUnitMemory(storage: Pick<Storage, "setItem"> | null | undefined, companyId: string, value: Record<string, string>) {
  try { storage?.setItem(inventoryUnitMemoryKey(companyId), JSON.stringify(value)); } catch { /* storage unavailable */ }
}
