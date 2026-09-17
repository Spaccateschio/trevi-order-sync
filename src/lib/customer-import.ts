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
};

export type ImportField = keyof Omit<ParsedCustomerRow, "rowIndex">;

/** Intestazioni Danea riconosciute (accento e maiuscole ignorati). */
const HEADER_MAP: { field: ImportField; headers: string[] }[] = [
  { field: "internal_reference", headers: ["cod.", "cod", "codice", "codice cliente"] },
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
  { field: "email", headers: ["e-mail", "email", "mail"] },
  { field: "phone", headers: ["tel.", "tel", "telefono", "cell", "cellulare"] },
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
};

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
): ParsedCustomerRow[] {
  const out: ParsedCustomerRow[] = [];
  rows.forEach((cells, index) => {
    const row: ParsedCustomerRow = {
      rowIndex: index + 2,
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
    };
    mapping.forEach((field, column) => {
      if (!field) return;
      const value = (cells[column] ?? "").toString().trim();
      if (!value) return;
      if (field === "phone" && row.phone) {
        row.phone = `${row.phone} · ${value}`;
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
];

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
    const row: ParsedCustomerRow = {
      rowIndex: index + 1,
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
    };
    for (const entry of XML_FIELDS) {
      row[entry.field] = textOf(node, entry.tags);
    }
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
  return { headers, mapping, rows, customers: rowsToCustomers(rows, mapping) };
}

export function remap(parsed: ParsedFile, mapping: (ImportField | null)[]): ParsedFile {
  return { ...parsed, mapping, customers: rowsToCustomers(parsed.rows, mapping) };
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
