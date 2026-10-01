import { supabase } from "@/integrations/supabase/client";

/**
 * Unica fonte degli indirizzi: tabella addresses con le sue tipologie (address_functions).
 * Usata da Dati generali, Preferenze di consegna, chiusura Lista e consegna ordine.
 */
export type AddressOwnerColumn = "company_id" | "customer_record_id" | "supplier_record_id";

export type StoredAddress = {
  id: string;
  label: string | null;
  address_line: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
  status: string;
  visible_to_partners: boolean;
  address_functions: { id: string; function: string; is_default: boolean }[];
};

export async function fetchAddresses(column: AddressOwnerColumn, value: string): Promise<StoredAddress[]> {
  const { data, error } = await supabase
    .from("addresses")
    .select(
      "id, label, address_line, street_number, postal_code, city, province, country, contact_name, phone, notes, status, visible_to_partners, address_functions(id, function, is_default)",
    )
    .eq(column, value)
    .order("label");
  if (error) throw error;
  return (data ?? []) as unknown as StoredAddress[];
}
