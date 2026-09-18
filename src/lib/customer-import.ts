/**
 * Importazione massiva clienti da un'esportazione Danea.
 *
 * Il file dei soggetti Danea che abbiamo verificato contiene una riga per
 * cliente con un solo indirizzo: non esistono colonne di destinazione merce.
 * Per questo non deduciamo destinazioni dai dati e non creiamo clienti diversi
 * solo perché l'indirizzo cambia: le destinazioni si gestiscono nella scheda
 * cliente (o in futuro con un'esportazione dedicata delle destinazioni Danea).
 */
import * as XLSX from "xlsx";

export type ParsedCustomerRow = {
  rowIndex: number;
  legal_name: string;
  vat_number: string;
  tax_code: string;
  email: string;
  phone: string;
  address_line: string;
  postal_code: string;
  city: string;
  province: string;
  internal_reference: string;
  notes: string;
  region: string;
  country: string;
  sdi_code: string;
  sdi_admin_reference: string;
  contact_name: string;
  fax: string;
  pec: string;
  discounts: string;
  credit_limit: string;
  agent: string;
  payment_terms: string;
  bank: string;
  our_bank: string;
  price_list: string;
  /** Colonne Danea compilate ma senza campo dedicato: intestazione → valore. */
  extra: Record<string, string>;
};

export type ImportField = keyof Omit<ParsedCustomerRow, "rowIndex" | "extra">;

/** Campi dove i valori di più colonne vengono uniti invece di sovrascriversi. */
const MERGEABLE: ImportField[] = ["phone"];

/** Intestazioni Danea riconosciute (accento e maiuscole ignorati). */
const HEADER_MAP: { field: ImportField; headers: string[] }[] = [
  { field: "internal_reference", headers: ["cod.", "cod", "codice", "codice cliente", "codice danea"] },
  { field: "tax_code", headers: ["codice fiscale", "cod. fiscale", "cf"] },
  { field: "vat_number", headers: ["partita iva", "p.iva", "piva", "partita i.v.a."] },
  {
    field: "legal_name",
    headers: ["denominazione", "ragione sociale", "nominativo", "cliente"],
  },
  { field: "address_line", headers: ["indirizzo", "via"] },
  { field: "postal_code", headers: ["cap"] },
  { field: "city", headers: ["citta", "città", "comune"] },
  { field: "province", headers: ["prov.", "prov", "provincia"] },
  { field: "region", headers: ["regione"] },
  { field: "country", headers: ["nazione", "paese", "stato"] },
  {
    field: "sdi_code",
    headers: [
      "cod. destinatario fatt. elettr.",
      "cod. destinatario fatt elettr.",
      "codice destinatario",
      "cod. destinatario",
      "sdi",
    ],
  },
  {
    field: "sdi_admin_reference",
    headers: [
      "rif. ammin. fatt. elettr.",
      "rif. ammin. fatt elettr.",
      "rif. amministrativo",
      "riferimento amministrativo",
    ],
  },
  { field: "contact_name", headers: ["referente", "contatto"] },
  { field: "email", headers: ["e-mail", "email", "mail"] },
  { field: "pec", headers: ["pec"] },
  { field: "fax", headers: ["fax"] },
  { field: "phone", headers: ["tel.", "tel", "telefono", "cell", "cellulare"] },
  { field: "discounts", headers: ["sconti", "sconto"] },
  { field: "price_list", headers: ["listino"] },
  { field: "credit_limit", headers: ["fido"] },
  { field: "agent", headers: ["agente"] },
  { field: "payment_terms", headers: ["pagamento", "condizioni di pagamento"] },
  { field: "bank", headers: ["banca"] },
  { field: "our_bank", headers: ["ns banca", "ns. banca", "nostra banca"] },
  { field: "notes", headers: ["note", "note doc."] },
];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  legal_name: "Ragione sociale",
  vat_number: "Partita IVA",
  tax_code: "Codice fiscale",
  email: "Email",
  phone: "Telefono",
  address_line: "Indirizzo",
  postal_code: "CAP",
  city: "Città",
  province: "Provincia",
  internal_reference: "Codice Danea",
  notes: "Note",
  region: "Regione",
  country: "Nazione",
  sdi_code: "Cod. destinatario fatt. elettr.",
  sdi_admin_reference: "Rif. ammin. fatt. elettr.",
  contact_name: "Referente",
  fax: "Fax",
  pec: "PEC",
  discounts: "Sconti",
  credit_limit: "Fido",
  agent: "Agente",
  payment_terms: "Pagamento",
  bank: "Banca",
  our_bank: "Nostra banca",
  price_list: "Listino",
};

function emptyRow(rowIndex: number): ParsedCustomerRow {
  return {
    rowIndex,
    legal_name: "",
    vat_number: "",
    tax_code: "",
    email: "",
    phone: "",
    address_line: "",
    postal_code: "",
    city: "",
    province: "",
    internal_reference: "",
    notes: "",
    region: "",
    country: "",
    sdi_code: "",
    sdi_admin_reference: "",
    contact_name: "",
    fax: "",
    pec: "",
    discounts: "",
    credit_limit: "",
    agent: "",
    payment_terms: "",
    bank: "",
    our_bank: "",
    price_list: "",
    extra: {},
  };
}

/**
 * Colonne Danea senza campo dedicato: conservate in `danea_extra` con
 * un'etichetta canonica e la scheda in cui vanno mostrate.
 */
export type DaneaExtraGroup = "anagrafica" | "commerciale" | "varie";

export const DANEA_EXTRA_FIELDS: {
  label: string;
  group: DaneaExtraGroup;
  headers: string[];
}[] = [
  { label: "Data mandato SDD", group: "commerciale", headers: ["data mandato sdd"] },
  { label: "Emissione SDD", group: "commerciale", headers: ["emissione sdd"] },
  {
    label: "Responsabile trasporto",
    group: "commerciale",
    headers: ["resp. trasporto", "resp trasporto", "inc. trasporto", "responsabile trasporto"],
  },
  { label: "Porto", group: "commerciale", headers: ["porto"] },
  {
    label: "Aliquota IVA",
    group: "commerciale",
    headers: ["fatt. con iva", "fatt con iva", "aliquota iva"],
  },
  {
    label: "Dichiarazione d'intento",
    group: "commerciale",
    headers: ["dich. d'intento", "dich d'intento", "dich. intento", "dichiarazione d'intento"],
  },
  {
    label: "Data dichiarazione d'intento",
    group: "commerciale",
    headers: ["data dich. d'intento", "data dich d'intento", "data dichiarazione d'intento"],
  },
  {
    label: "Conto contabile",
    group: "commerciale",
    headers: ["conto reg.", "conto reg", "conto"],
  },
  {
    label: "Ritenuta d'acconto",
    group: "commerciale",
    headers: ["rit. acconto?", "rit. acconto", "rit acconto", "ritenuta d'acconto"],
  },
  {
    label: "Invio documenti via e-mail",
    group: "commerciale",
    headers: ["doc via e-mail?", "doc via e-mail", "doc via email", "invia documenti tramite e-mail"],
  },
  {
    label: "Avviso nuovi documenti",
    group: "commerciale",
    headers: ["avviso nuovi doc.", "avviso nuovi doc", "mostra avviso"],
  },
  {
    label: "Nota in creazione documenti",
    group: "commerciale",
    headers: ["note doc.", "note doc", "inserisci nota"],
  },
  { label: "Home page", group: "varie", headers: ["home page", "homepage", "sito web"] },
  { label: "Login web", group: "varie", headers: ["login web"] },
  { label: "Libero 1", group: "varie", headers: ["libero 1"] },
  { label: "Libero 2", group: "varie", headers: ["libero 2"] },
  { label: "Libero 3", group: "varie", headers: ["libero 3"] },
  { label: "Libero 4", group: "varie", headers: ["libero 4"] },
  { label: "Libero 5", group: "varie", headers: ["libero 5"] },
  { label: "Libero 6", group: "varie", headers: ["libero 6"] },
];

/** Etichetta canonica per una colonna Danea senza campo dedicato. */
export function canonicalExtraLabel(header: string): string | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  return DANEA_EXTRA_FIELDS.find((entry) => entry.headers.includes(normalized))?.label ?? null;
}

/** Etichetta → scheda in cui mostrare il dato importato. */
export const DANEA_EXTRA_GROUP_BY_LABEL: Record<string, DaneaExtraGroup> = Object.fromEntries(
  DANEA_EXTRA_FIELDS.map((entry) => [entry.label, entry.group]),
);

/** Numero di listino Danea, se la colonna contiene un numero. */
export function parsePriceListNumber(value: string): number | null {
  const match = value.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1000 ? parsed : null;
}

/**
 * Nel file Danea la colonna Listino contiene il nome del listino
 * ("BAR", "Listino 13"), non il numero: lo risolviamo confrontando i nomi
 * dei listini dell'azienda. Se non c'è corrispondenza non assegniamo nulla.
 */
export function resolvePriceListNumber(
  value: string,
  lists: { listNumber: number; label: string }[],
): number | null {
  const wanted = normalizeHeader(value);
  if (!wanted) return null;
  const byName = lists.find((item) => normalizeHeader(item.label) === wanted);
  if (byName) return byName.listNumber;
  const numeric = parsePriceListNumber(value);
  if (numeric && lists.some((item) => item.listNumber === numeric)) return numeric;
  return null;
}


function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeVat(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Abbinamento automatico intestazione → campo; indice = colonna del file. */
export function detectMapping(headers: string[]): (ImportField | null)[] {
  const used = new Set<ImportField>();
  return headers.map((header) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return null;
    const match = HEADER_MAP.find(
      (entry) => entry.headers.includes(normalized) && !used.has(entry.field),
    );
    if (!match) return null;
    // Danea ha due colonne telefoniche (Tel. e Cell): le uniamo entrambe.
    if (match.field !== "phone") used.add(match.field);
    return match.field;
  });
}

function rowsToCustomers(
  rows: string[][],
  mapping: (ImportField | null)[],
  headers: string[] = [],
): ParsedCustomerRow[] {
  const out: ParsedCustomerRow[] = [];
  rows.forEach((cells, index) => {
    const row = emptyRow(index + 2);
    (cells.length > mapping.length ? cells : mapping).forEach((_, column) => {
      const field = mapping[column] ?? null;
      const value = (cells[column] ?? "").toString().trim();
      if (!value) return;
      if (!field) {
        // Colonna non abbinata ma compilata: la conserviamo fra gli altri dati Danea.
        const header = (headers[column] ?? "").toString().trim();
        const label = canonicalExtraLabel(header) || header || `Colonna ${column + 1}`;

        row.extra[label] = row.extra[label] ? `${row.extra[label]} · ${value}` : value;
        return;
      }
      if (MERGEABLE.includes(field) && row[field]) {
        row[field] = `${row[field]} · ${value}`;
        return;
      }
      row[field] = value;
    });
    out.push(row);
  });
  return out;
}

export type ParsedFile = {
  headers: string[];
  mapping: (ImportField | null)[];
  rows: string[][];
  customers: ParsedCustomerRow[];
};

function splitCsvLine(line: string, separator: string) {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === separator && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.map((value) => value.trim());
}

function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/)[0] ?? "";
  const separator =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  return clean
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => splitCsvLine(line, separator));
}

const XML_FIELDS: { field: ImportField; tags: string[] }[] = [
  { field: "legal_name", tags: ["Company", "Name", "Denominazione", "CompanyName"] },
  { field: "vat_number", tags: ["VatCode", "VatNumber", "PartitaIva"] },
  { field: "tax_code", tags: ["FiscalCode", "TaxCode", "CodiceFiscale"] },
  { field: "address_line", tags: ["Address", "Indirizzo"] },
  { field: "postal_code", tags: ["Postcode", "PostalCode", "Cap"] },
  { field: "city", tags: ["City", "Citta"] },
  { field: "province", tags: ["Province", "Prov"] },
  { field: "email", tags: ["Email", "EMail"] },
  { field: "phone", tags: ["Phone", "Tel", "Mobile", "Cell"] },
  { field: "internal_reference", tags: ["Code", "CustomerCode", "Cod"] },
  { field: "notes", tags: ["Notes", "Note"] },
  { field: "region", tags: ["Region", "Regione"] },
  { field: "country", tags: ["Country", "Nazione"] },
  { field: "sdi_code", tags: ["EInvoiceDestCode", "SdiCode", "CodiceDestinatario"] },
  { field: "sdi_admin_reference", tags: ["EInvoiceAdminRef", "RifAmministrativo"] },
  { field: "contact_name", tags: ["Contact", "Referente", "ContactName"] },
  { field: "fax", tags: ["Fax"] },
  { field: "pec", tags: ["Pec", "EmailPec"] },
  { field: "discounts", tags: ["Discounts", "Sconti", "Discount"] },
  { field: "price_list", tags: ["PriceList", "Listino", "PriceListNum"] },
  { field: "credit_limit", tags: ["CreditLimit", "Fido"] },
  { field: "agent", tags: ["Agent", "Agente"] },
  { field: "payment_terms", tags: ["Payment", "Pagamento", "PaymentTerms"] },
  { field: "bank", tags: ["Bank", "Banca"] },
  { field: "our_bank", tags: ["OurBank", "NsBanca"] },
];

const XML_KNOWN_TAGS = new Set(
  XML_FIELDS.flatMap((entry) => entry.tags.map((tag) => tag.toLowerCase())),
);

function textOf(element: Element, tags: string[]) {
  for (const tag of tags) {
    const node =
      element.getElementsByTagName(tag)[0] ??
      element.getElementsByTagName(tag.toLowerCase())[0] ??
      null;
    const value = node?.textContent?.trim();
    if (value) return value;
  }
  const attr = tags.map((tag) => element.getAttribute(tag)).find((v) => v && v.trim());
  return attr?.trim() ?? "";
}

function parseDaneaSubjectsXml(text: string): ParsedCustomerRow[] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Il file XML non è leggibile.");
  }
  const candidates = ["Customer", "Customers", "Subject", "Soggetto", "Cliente"];
  let nodes: Element[] = [];
  for (const tag of candidates) {
    const found = Array.from(doc.getElementsByTagName(tag));
    const leaves = found.filter((node) => node.children.length > 0);
    if (leaves.length > nodes.length) nodes = leaves;
  }
  if (!nodes.length) {
    throw new Error("Nel file XML non ho trovato clienti da importare.");
  }
  return nodes.map((node, index) => {
    const row = emptyRow(index + 1);
    for (const entry of XML_FIELDS) {
      row[entry.field] = textOf(node, entry.tags);
    }
    // Tag compilati senza campo dedicato: conservati fra gli altri dati Danea.
    Array.from(node.children).forEach((child) => {
      if (child.children.length) return;
      if (XML_KNOWN_TAGS.has(child.tagName.toLowerCase())) return;
      const value = child.textContent?.trim();
      if (value) row.extra[child.tagName] = value;
    });
    return row;
  });
}

export async function parseCustomerFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".xml")) {
    const customers = parseDaneaSubjectsXml(await file.text());
    return { headers: [], mapping: [], rows: [], customers };
  }

  let grid: string[][];
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    grid = parseCsv(await file.text());
  } else {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) throw new Error("Il foglio di calcolo è vuoto.");
    grid = XLSX.utils
      .sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" })
      .map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
  }

  const headerRow = grid.findIndex((row) => detectMapping(row).some((f) => f === "legal_name"));
  const headerIndex = headerRow >= 0 ? headerRow : 0;
  const headers = grid[headerIndex] ?? [];
  const mapping = detectMapping(headers);
  const rows = grid.slice(headerIndex + 1).filter((row) => row.some((cell) => cell.trim()));
  return { headers, mapping, rows, customers: rowsToCustomers(rows, mapping, headers) };
}

export function remap(parsed: ParsedFile, mapping: (ImportField | null)[]): ParsedFile {
  return {
    ...parsed,
    mapping,
    customers: rowsToCustomers(parsed.rows, mapping, parsed.headers),
  };
}

export type ExistingCustomer = {
  id: string;
  legal_name: string;
  vat_normalized: string | null;
  tax_code: string | null;
  internal_reference: string | null;
};

export type PreviewItem = {
  row: ParsedCustomerRow;
  outcome: "create" | "update" | "skip";
  existingId?: string;
  existingName?: string;
  reason?: string;
};

/** Anteprima: cosa verrà creato, aggiornato o scartato. */
export function buildPreview(
  customers: ParsedCustomerRow[],
  existing: ExistingCustomer[],
): PreviewItem[] {
  const byVat = new Map<string, ExistingCustomer>();
  const byTax = new Map<string, ExistingCustomer>();
  const byRef = new Map<string, ExistingCustomer>();
  for (const record of existing) {
    if (record.vat_normalized) byVat.set(record.vat_normalized, record);
    if (record.tax_code) byTax.set(normalizeVat(record.tax_code), record);
    if (record.internal_reference) byRef.set(record.internal_reference.trim().toLowerCase(), record);
  }

  const seenVat = new Set<string>();
  const seenRef = new Set<string>();

  return customers.map((row) => {
    if (!row.legal_name.trim()) {
      return { row, outcome: "skip", reason: "Ragione sociale mancante" } as PreviewItem;
    }
    const vat = normalizeVat(row.vat_number);
    const ref = row.internal_reference.trim().toLowerCase();

    if (vat && seenVat.has(vat)) {
      return { row, outcome: "skip", reason: "Partita IVA ripetuta nel file" } as PreviewItem;
    }
    if (!vat && ref && seenRef.has(ref)) {
      return { row, outcome: "skip", reason: "Codice Danea ripetuto nel file" } as PreviewItem;
    }
    if (vat) seenVat.add(vat);
    if (ref) seenRef.add(ref);

    const match =
      (vat ? byVat.get(vat) : undefined) ??
      (row.tax_code ? byTax.get(normalizeVat(row.tax_code)) : undefined) ??
      (ref ? byRef.get(ref) : undefined);

    if (match) {
      return {
        row,
        outcome: "update",
        existingId: match.id,
        existingName: match.legal_name,
      } as PreviewItem;
    }
    return { row, outcome: "create" } as PreviewItem;
  });
}
