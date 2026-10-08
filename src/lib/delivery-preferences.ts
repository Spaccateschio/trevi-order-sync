import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { fetchAddresses } from "@/lib/company-addresses";

/** Preferenze di consegna aziendali: solo valori iniziali, mai vincoli sulla singola Lista/ordine. */
export type DeliveryDay = "oggi" | "domani";

export type CompanyAddressOption = { id: string; text: string; functions: string[] };

export type DeliveryPreferences = {
  timezone: string;
  addressId: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  windowHours: 2 | 3 | 4;
  day: DeliveryDay;
  addresses: CompanyAddressOption[];
};

const DEFAULT_TZ = "Europe/Rome";

/** Data locale (YYYY-MM-DD) nel fuso dell'azienda, non UTC. */
export function localToday(timezone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
}

export function addDays(iso: string, days: number): string {
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function formatDateIt(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** «Oggi — 01/10/2026», «Domani — 02/10/2026» oppure la sola data. */
export function deliveryDateLabel(iso: string | null, today: string): string {
  if (!iso) return "Data non indicata";
  if (iso === today) return `Oggi — ${formatDateIt(iso)}`;
  if (iso === addDays(today, 1)) return `Domani — ${formatDateIt(iso)}`;
  return formatDateIt(iso);
}

export const hhmm = (value: string | null | undefined) => (value ? value.slice(0, 5) : "");

export function timeRangeLabel(from: string | null, to: string | null): string {
  if (!from && !to) return "Orario non indicato";
  if (from && to) return `${hhmm(from)} – ${hhmm(to)}`;
  return from ? `Dalle ${hhmm(from)}` : `Entro le ${hhmm(to)}`;
}

type AddressRow = {
  id: string;
  label: string | null;
  address_line: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;
};

export function addressText(a: AddressRow): string {
  const street = [a.address_line, a.street_number].filter(Boolean).join(" ");
  const place = [a.postal_code, a.city].filter(Boolean).join(" ");
  const body = [street, place].filter(Boolean).join(", ");
  return a.label ? (body ? `${a.label} — ${body}` : a.label) : body;
}

export function useDeliveryPreferences(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["delivery-preferences", companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<DeliveryPreferences> => {
      const [settings, addresses] = await Promise.all([
        supabase
          .from("company_settings")
          .select("timezone, default_delivery_address_id, default_delivery_time_from, default_delivery_time_to, default_delivery_day, delivery_window_hours")
          .eq("company_id", companyId!)
          .maybeSingle(),
        fetchAddresses("company_id", companyId!),
      ]);
      if (settings.error) throw new Error(settings.error.message);
      const s = settings.data;
      return {
        timezone: s?.timezone || DEFAULT_TZ,
        addressId: s?.default_delivery_address_id ?? null,
        timeFrom: s?.default_delivery_time_from ?? null,
        timeTo: s?.default_delivery_time_to ?? null,
        windowHours: (s?.delivery_window_hours as 2 | 3 | 4) ?? 4,
        day: (s?.default_delivery_day as DeliveryDay) ?? "oggi",
        addresses: addresses.filter((a) => a.status === "attivo").map((a) => ({ id: a.id, text: addressText(a), functions: a.address_functions.map((f) => f.function) })),
      };
    },
  });
}
