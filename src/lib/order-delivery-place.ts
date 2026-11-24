import type { CompanyAddressOption } from "@/lib/delivery-preferences";

export const DELIVERY_PLACE_MANUAL = "__luogo_manuale__";
export const DELIVERY_PLACE_PICKUP = "__ritiro__";
export const DELIVERY_PLACE_PICKUP_TEXT = "Passo io a ritirare";
export const DELIVERY_PLACE_SAVED_PREFIX = "salvato:";

export type DeliveryPlaceDraft = {
  address: string;
  addressId: string | null;
  savePlace: boolean;
};

export type SavedDeliveryPlace = { id: string; text: string; supplier_record_id: string | null };

/** Le indicazioni salvate appartengono al solo fornitore per cui sono state scritte. */
export function deliveryPlacesForSupplier(places: SavedDeliveryPlace[], supplierId: string | null): SavedDeliveryPlace[] {
  if (!supplierId) return [];
  return places.filter((place) => place.supplier_record_id === supplierId);
}

export function normalizeDeliveryPlace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function deliveryPlaceSelectValue(
  value: Pick<DeliveryPlaceDraft, "address" | "addressId">,
  addresses: CompanyAddressOption[],
  savedPlaces: SavedDeliveryPlace[],
): string {
  if (value.addressId && addresses.some((address) => address.id === value.addressId)) return value.addressId;
  const text = normalizeDeliveryPlace(value.address).toLocaleLowerCase("it");
  if (text === DELIVERY_PLACE_PICKUP_TEXT.toLocaleLowerCase("it")) return DELIVERY_PLACE_PICKUP;
  const saved = savedPlaces.find((place) => normalizeDeliveryPlace(place.text).toLocaleLowerCase("it") === text);
  return saved ? `${DELIVERY_PLACE_SAVED_PREFIX}${saved.id}` : DELIVERY_PLACE_MANUAL;
}

/** Un indirizzo registrato conserva il suo ID; ritiro, frasi e indirizzi manuali sono sempre testo libero. */
export function deliveryPlaceFromSelection(
  selection: string,
  _current: DeliveryPlaceDraft,
  addresses: CompanyAddressOption[],
  savedPlaces: SavedDeliveryPlace[],
): DeliveryPlaceDraft {
  const address = addresses.find((item) => item.id === selection);
  if (address) return { address: address.text, addressId: address.id, savePlace: false };
  if (selection === DELIVERY_PLACE_PICKUP) return { address: DELIVERY_PLACE_PICKUP_TEXT, addressId: null, savePlace: false };
  if (selection.startsWith(DELIVERY_PLACE_SAVED_PREFIX)) {
    const id = selection.slice(DELIVERY_PLACE_SAVED_PREFIX.length);
    const saved = savedPlaces.find((place) => place.id === id);
    if (saved) return { address: saved.text, addressId: null, savePlace: false };
  }
  return { address: "", addressId: null, savePlace: false };
}

export function shouldSaveDeliveryPlace(value: DeliveryPlaceDraft): boolean {
  return value.savePlace && value.addressId === null && normalizeDeliveryPlace(value.address).length > 0;
}
