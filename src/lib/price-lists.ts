import { supabase } from "@/integrations/supabase/client";

export type ActivePriceList = {
  listNumber: number;
  label: string;
  archiveId: string | null;
  archiveName: string | null;
};

export type DaneaArchive = {
  id: string;
  name: string;
  isDefault: boolean;
};

/** Archivi Danea attivi dell'azienda: servono a separare clienti, prodotti e listini. */
export async function fetchDaneaArchives(companyId: string): Promise<DaneaArchive[]> {
  const { data, error } = await supabase
    .from("danea_archives")
    .select("id, name, is_default, status")
    .eq("company_id", companyId)
    .eq("status", "attivo")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
  }));
}

/**
 * Listini Danea attivi dell'azienda venditrice.
 * Ogni archivio ha i propri listini: lo stesso numero può esistere in più
 * archivi con nomi diversi, quindi l'archivio fa parte dell'identità.
 */
export async function fetchActivePriceLists(companyId: string): Promise<ActivePriceList[]> {
  const { data, error } = await supabase
    .from("danea_price_lists")
    .select("list_number, danea_name, display_name, archive_id, danea_archives(name)")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("list_number");
  if (error) throw new Error(error.message);

  const seen = new Set<string>();
  const lists: ActivePriceList[] = [];
  for (const row of (data ?? []) as Array<{
    list_number: number;
    danea_name: string | null;
    display_name: string | null;
    archive_id: string | null;
    danea_archives: { name: string } | { name: string }[] | null;
  }>) {
    const key = `${row.archive_id ?? "-"}:${row.list_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const archive = Array.isArray(row.danea_archives) ? row.danea_archives[0] : row.danea_archives;
    lists.push({
      listNumber: row.list_number,
      label: row.display_name ?? row.danea_name ?? `Listino ${row.list_number}`,
      archiveId: row.archive_id ?? null,
      archiveName: archive?.name ?? null,
    });
  }
  return lists;
}

/**
 * Listini utilizzabili per un cliente: quelli del suo archivio.
 * Cliente senza archivio: comportamento di prima, un listino per numero.
 */
export function listsForArchive(
  lists: ActivePriceList[],
  archiveId: string | null | undefined,
): ActivePriceList[] {
  if (archiveId) return lists.filter((item) => item.archiveId === archiveId);
  const seen = new Set<number>();
  const result: ActivePriceList[] = [];
  for (const item of lists) {
    if (seen.has(item.listNumber)) continue;
    seen.add(item.listNumber);
    result.push(item);
  }
  return result;
}

/** Listino predefinito per i nuovi clienti: impostato oppure il primo attivo. */
export async function fetchDefaultPriceList(companyId: string) {
  const { data, error } = await supabase.rpc("resolve_default_price_list", {
    _company_id: companyId,
  });
  if (error) throw new Error(error.message);
  return data === null || data === undefined ? null : Number(data);
}

/** Valore memorizzato nelle impostazioni (senza il fallback al primo listino attivo). */
export async function fetchDefaultPriceListSetting(companyId: string) {
  const { data, error } = await supabase
    .from("company_settings")
    .select("default_price_list_number")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.default_price_list_number ?? null;
}

export async function setDefaultPriceList(companyId: string, listNumber: number | null) {
  const { error } = await supabase.rpc("set_default_price_list", {
    _company_id: companyId,
    _list_number: listNumber as number,
  });
  if (error) throw new Error(error.message);
}

export async function setCustomerPriceList(customerRecordId: string, listNumber: number | null) {
  const { error } = await supabase.rpc("set_customer_price_list", {
    _customer_record_id: customerRecordId,
    _list_number: listNumber as number,
  });
  if (error) throw new Error(error.message);
}

export function priceListLabel(
  lists: ActivePriceList[],
  listNumber: number | null | undefined,
  archiveId?: string | null,
) {
  if (listNumber === null || listNumber === undefined) return "Nessun listino · prezzi su richiesta";
  const scoped = listsForArchive(lists, archiveId);
  return scoped.find((item) => item.listNumber === listNumber)?.label ?? `Listino ${listNumber}`;
}
