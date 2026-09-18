import type { SortingState } from "@tanstack/react-table";

export type ProductPrice = {
  list_number: number;
  net_price: number | null;
  gross_price: number | null;
};

export type ProductRow = {
  id: string;
  archive_id: string;
  code: string;
  description: string | null;
  description_html: string | null;
  category: string | null;
  subcategory: string | null;
  danea_um: string | null;
  size_um: string | null;
  weight_um: string | null;
  vat_perc: number | null;
  vat_code: string | null;
  vat_description: string | null;
  vat_class: string | null;
  publish_status: "pubblicato" | "non_pubblicato";
  b2b_visible: boolean;
  danea_internal_id: string | null;
  notes: string | null;
  image_file_name: string | null;
  image_folder: string | null;
  supplier_code: string | null;
  supplier_name: string | null;
  supplier_product_code: string | null;
  supplier_notes: string | null;
  producer_name: string | null;
  product_type: string | null;
  barcode: string | null;
  link: string | null;
  custom_field_1: string | null;
  custom_field_2: string | null;
  custom_field_3: string | null;
  custom_field_4: string | null;
  last_received_at: string;
  first_received_at: string;
  product_prices: ProductPrice[];
  product_images?: { id: string } | null;
  sale_units?: { code: string; is_default: boolean; needs_review: boolean }[];
};

export type GridDevice = "desktop" | "tablet" | "smartphone";
export type GridPreferences = {
  visibility: Record<string, boolean>;
  order: string[];
  sizing: Record<string, number>;
  sorting: SortingState;
};

export type ProductColumn = {
  id: string;
  label: string;
  size: number;
  minSize: number;
  adminOnly?: boolean;
  numeric?: boolean;
  value: (product: ProductRow, archives: Map<string, string>) => string | number | null;
};

export const euro = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);

export const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(
        new Date(value),
      )
    : "—";

export const priceForList = (product: ProductRow, listNumber: number) => {
  const price = product.product_prices.find((item) => item.list_number === listNumber);
  return price?.net_price ?? price?.gross_price ?? null;
};

const text = (value: string | null | undefined) => value || "—";

export const PRODUCT_COLUMNS: ProductColumn[] = [
  { id: "code", label: "Codice", size: 120, minSize: 84, value: (p) => p.code },
  { id: "description", label: "Descrizione", size: 320, minSize: 160, value: (p) => text(p.description) },
  { id: "description_html", label: "Descrizione HTML", size: 260, minSize: 150, value: (p) => text(p.description_html) },
  { id: "category", label: "Categoria", size: 170, minSize: 110, value: (p) => text(p.category) },
  { id: "subcategory", label: "Sottocategoria", size: 170, minSize: 110, value: (p) => text(p.subcategory) },
  { id: "danea_um", label: "U.M. Danea", size: 100, minSize: 76, value: (p) => text(p.danea_um) },
  { id: "sale_units", label: "U.M. vendita", size: 160, minSize: 110, value: (p) => p.sale_units?.map((unit) => unit.code).join(", ") || "—" },
  { id: "default_sale_unit", label: "U.M. predefinita", size: 145, minSize: 110, value: (p) => p.sale_units?.find((unit) => unit.is_default)?.code ?? "—" },
  { id: "unit_review", label: "Conversioni da verificare", size: 190, minSize: 140, value: (p) => p.sale_units?.some((unit) => unit.needs_review) ? "Da verificare" : "—" },
  { id: "image", label: "Immagine", size: 84, minSize: 68, value: (p) => p.product_images ? "Sì" : "No" },
  { id: "price_1", label: "Listino 1", size: 112, minSize: 92, numeric: true, value: (p) => priceForList(p, 1) },
  ...Array.from({ length: 8 }, (_, index): ProductColumn => {
    const number = index + 2;
    return {
      id: `price_${number}`,
      label: `Listino ${number}`,
      size: 112,
      minSize: 92,
      numeric: true,
      value: (p) => priceForList(p, number),
    };
  }),
  { id: "vat", label: "IVA", size: 90, minSize: 72, value: (p) => p.vat_perc !== null ? `${p.vat_perc}%` : text(p.vat_code) },
  { id: "vat_class", label: "Classe IVA", size: 120, minSize: 90, value: (p) => text(p.vat_class) },
  { id: "vat_description", label: "Descrizione IVA", size: 160, minSize: 110, value: (p) => text(p.vat_description) },
  { id: "status", label: "Stato", size: 128, minSize: 105, value: (p) => p.publish_status === "pubblicato" ? "Pubblicato" : "Non pubblicato" },
  { id: "b2b_visible", label: "In vetrina B2B", size: 130, minSize: 105, value: (p) => p.b2b_visible ? "In vetrina" : "Nascosto" },
  { id: "archive", label: "Archivio", size: 170, minSize: 110, value: (p, archives) => archives.get(p.archive_id) ?? "—" },
  { id: "internal_id", label: "InternalID", size: 130, minSize: 95, value: (p) => text(p.danea_internal_id) },
  { id: "size_um", label: "U.M. dimensioni", size: 135, minSize: 100, value: (p) => text(p.size_um) },
  { id: "weight_um", label: "U.M. peso", size: 110, minSize: 90, value: (p) => text(p.weight_um) },
  { id: "barcode", label: "Barcode", size: 150, minSize: 100, value: (p) => text(p.barcode) },
  { id: "product_type", label: "Tipo prodotto", size: 140, minSize: 100, value: (p) => text(p.product_type) },
  { id: "producer_name", label: "Produttore", size: 160, minSize: 105, value: (p) => text(p.producer_name) },
  { id: "supplier_name", label: "Fornitore", size: 170, minSize: 110, adminOnly: true, value: (p) => text(p.supplier_name) },
  { id: "supplier_code", label: "Codice fornitore", size: 145, minSize: 105, adminOnly: true, value: (p) => text(p.supplier_code) },
  { id: "supplier_product_code", label: "Cod. prod. fornitore", size: 165, minSize: 120, adminOnly: true, value: (p) => text(p.supplier_product_code) },
  { id: "supplier_notes", label: "Note fornitore", size: 220, minSize: 140, adminOnly: true, value: (p) => text(p.supplier_notes) },
  { id: "notes", label: "Note", size: 240, minSize: 140, value: (p) => text(p.notes) },
  { id: "image_file_name", label: "Nome file immagine", size: 180, minSize: 120, value: (p) => text(p.image_file_name) },
  { id: "image_folder", label: "Cartella immagine", size: 180, minSize: 120, value: (p) => text(p.image_folder) },
  { id: "link", label: "Link", size: 220, minSize: 140, value: (p) => text(p.link) },
  { id: "custom_field_1", label: "Campo personalizzato 1", size: 180, minSize: 130, value: (p) => text(p.custom_field_1) },
  { id: "custom_field_2", label: "Campo personalizzato 2", size: 180, minSize: 130, value: (p) => text(p.custom_field_2) },
  { id: "custom_field_3", label: "Campo personalizzato 3", size: 180, minSize: 130, value: (p) => text(p.custom_field_3) },
  { id: "custom_field_4", label: "Campo personalizzato 4", size: 180, minSize: 130, value: (p) => text(p.custom_field_4) },
  { id: "last_received_at", label: "Ultimo aggiornamento", size: 155, minSize: 120, value: (p) => dateTime(p.last_received_at) },
  { id: "first_received_at", label: "Prima ricezione", size: 155, minSize: 120, value: (p) => dateTime(p.first_received_at) },
];

export const DEFAULT_COLUMN_ORDER = PRODUCT_COLUMNS.map((column) => column.id);
export const DEFAULT_VISIBLE_COLUMNS = ["code", "description", "category", "danea_um", "price_1"];

export function defaultGridPreferences(): GridPreferences {
  return {
    visibility: Object.fromEntries(PRODUCT_COLUMNS.map((column) => [column.id, DEFAULT_VISIBLE_COLUMNS.includes(column.id)])),
    order: [...DEFAULT_COLUMN_ORDER],
    sizing: Object.fromEntries(PRODUCT_COLUMNS.map((column) => [column.id, column.size])),
    sorting: [],
  };
}

export function formatGridValue(column: ProductColumn, value: string | number | null) {
  if (column.numeric && typeof value === "number") return euro(value);
  return value === null || value === "" ? "—" : String(value);
}