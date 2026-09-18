import { supabase } from "@/integrations/supabase/client";

export type ActivePriceList = {
  listNumber: number;
  label: string;
};

/** Listini Danea attivi dell'azienda venditrice, in ordine di numero. */
export async function fetchActivePriceLists(companyId: string): Promise<ActivePriceList[]> {
  const { data, error } = await supabase
    .from("danea_price_lists")
    .select("list_number, danea_name, display_name")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("list_number");
  if (error) throw new Error(error.message);

  const seen = new Set<number>();
  const lists: ActivePriceList[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.list_number)) continue;
    seen.add(row.list_number);
    lists.push({
      listNumber: row.list_number,
      label: row.display_name ?? row.danea_name ?? `Listino ${row.list_number}`,
    });
  }
  return lists;
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

export function priceListLabel(lists: ActivePriceList[], listNumber: number | null | undefined) {
  if (listNumber === null || listNumber === undefined) return "Nessun listino · prezzi su richiesta";
  return lists.find((item) => item.listNumber === listNumber)?.label ?? `Listino ${listNumber}`;
}
