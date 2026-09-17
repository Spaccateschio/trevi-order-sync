import { XMLParser } from "fast-xml-parser";

export type DaneaMode = "full" | "incremental";

export type DaneaProduct = {
  internalId: string | null;
  code: string;
  description: string | null;
  descriptionHtml: string | null;
  category: string | null;
  subcategory: string | null;
  subcategoryLevels: string[];
  um: string | null;
  sizeUm: string | null;
  weightUm: string | null;
  vatCode: string | null;
  vatPerc: number | null;
  vatClass: string | null;
  vatDescription: string | null;
  barcode: string | null;
  productType: string | null;
  producerName: string | null;
  link: string | null;
  notes: string | null;
  customField1: string | null;
  customField2: string | null;
  customField3: string | null;
  customField4: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  supplierProductCode: string | null;
  supplierNotes: string | null;
  supplierNetPrice: number | null;
  supplierGrossPrice: number | null;
  imageFileName: string | null;
  netPrices: Record<number, number | null>;
  grossPrices: Record<number, number | null>;
  raw: Record<string, unknown>;
};

export type DaneaIssue = { productCode: string | null; fieldName: string | null; reason: string };

export type DaneaDocument = {
  mode: DaneaMode;
  appVersion: string | null;
  creator: string | null;
  warehouse: string | null;
  imageFolder: string | null;
  defaultPrice: number | null;
  priceNames: Record<number, string>;
  products: DaneaProduct[];
  deletedCodes: string[];
  issues: DaneaIssue[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => name === "Product",
});

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    const inner = (value as Record<string, unknown>)["#text"];
    return text(inner);
  }
  const s = String(value).trim();
  return s.length ? s : null;
}

/** Danea usa il punto decimale e non invia simboli di valuta. */
function num(value: unknown): number | null {
  const s = text(value);
  if (s === null) return null;
  const normalized = s.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function attr(node: Record<string, unknown>, name: string): string | null {
  return text(node[`@${name}`]);
}

function mapProduct(node: Record<string, unknown>): DaneaProduct {
  const vatNode = node["Vat"];
  const vatObj = (typeof vatNode === "object" && vatNode !== null ? vatNode : {}) as Record<
    string,
    unknown
  >;

  const subcategoryLevels: string[] = [];
  for (let i = 2; i <= 9; i += 1) {
    const level = text(node[`Subcategory${i}`]);
    if (level) subcategoryLevels.push(level);
  }

  const netPrices: Record<number, number | null> = {};
  const grossPrices: Record<number, number | null> = {};
  for (let i = 1; i <= 9; i += 1) {
    netPrices[i] = num(node[`NetPrice${i}`]);
    grossPrices[i] = num(node[`GrossPrice${i}`]);
  }

  return {
    internalId: text(node["InternalID"]),
    code: text(node["Code"]) ?? "",
    description: text(node["Description"]),
    descriptionHtml: text(node["DescriptionHtml"]) ?? text(node["DescriptionHTML"]),
    category: text(node["Category"]),
    subcategory: text(node["Subcategory"]),
    subcategoryLevels,
    um: text(node["Um"]),
    vatCode: text(vatNode),
    vatPerc: num(attr(vatObj, "Perc")),
    vatClass: attr(vatObj, "Class"),
    vatDescription: attr(vatObj, "Description"),
    barcode: text(node["Barcode"]),
    productType: text(node["ProductType"]),
    producerName: text(node["ProducerName"]),
    link: text(node["Link"]),
    notes: text(node["Notes"]),
    customField1: text(node["CustomField1"]),
    customField2: text(node["CustomField2"]),
    customField3: text(node["CustomField3"]),
    customField4: text(node["CustomField4"]),
    supplierCode: text(node["SupplierCode"]),
    supplierName: text(node["SupplierName"]),
    supplierProductCode: text(node["SupplierProductCode"]),
    supplierNotes: text(node["SupplierNotes"]),
    supplierNetPrice: num(node["SupplierNetPrice"]),
    supplierGrossPrice: num(node["SupplierGrossPrice"]),
    imageFileName: text(node["ImageFileName"]),
    netPrices,
    grossPrices,
    raw: node,
  };
}

function asProductArray(list: unknown): Record<string, unknown>[] {
  if (!list || typeof list !== "object") return [];
  const products = (list as Record<string, unknown>)["Product"];
  if (!Array.isArray(products)) return [];
  return products.filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null);
}

export function parseDaneaProducts(xml: string): DaneaDocument {
  // Protezione contro trasmissioni interrotte: senza la chiusura dell'elemento
  // radice il file è incompleto e non deve essere elaborato (un invio completo
  // troncato depubblicherebbe per assenza prodotti in realtà validi).
  if (!/<\/EasyfattProducts\s*>\s*$/i.test(xml.trimEnd())) {
    throw new Error("Trasmissione incompleta: il file XML risulta troncato");
  }

  const parsed = parser.parse(xml) as Record<string, unknown>;
  const root = parsed["EasyfattProducts"];
  if (!root || typeof root !== "object") {
    throw new Error("XML non riconosciuto: manca l'elemento EasyfattProducts");
  }
  const rootNode = root as Record<string, unknown>;

  const rawMode = attr(rootNode, "Mode")?.toLowerCase();
  // Mode assente = vecchie versioni di Easyfatt, che inviano sempre il catalogo completo.
  const mode: DaneaMode = rawMode === "incremental" ? "incremental" : "full";

  const priceNames: Record<number, string> = {};
  for (let i = 1; i <= 9; i += 1) {
    const name = attr(rootNode, `PriceName${i}`);
    if (name) priceNames[i] = name;
  }

  const issues: DaneaIssue[] = [];
  const seen = new Set<string>();
  const products: DaneaProduct[] = [];

  const productNodes =
    mode === "incremental"
      ? asProductArray(rootNode["UpdatedProducts"])
      : asProductArray(rootNode["Products"]);

  for (const node of productNodes) {
    const product = mapProduct(node);
    if (!product.code) {
      issues.push({ productCode: null, fieldName: "Code", reason: "Codice prodotto mancante" });
      continue;
    }
    if (seen.has(product.code)) {
      issues.push({
        productCode: product.code,
        fieldName: "Code",
        reason: "Codice ripetuto nello stesso invio: elaborata solo la prima riga",
      });
      continue;
    }
    seen.add(product.code);
    products.push(product);
  }

  const deletedCodes: string[] = [];
  if (mode === "incremental") {
    for (const node of asProductArray(rootNode["DeletedProducts"])) {
      // Nei DeletedProducts Danea invia esclusivamente <Code>.
      const code = text(node["Code"]);
      if (!code) {
        issues.push({
          productCode: null,
          fieldName: "Code",
          reason: "Prodotto da depubblicare senza codice",
        });
        continue;
      }
      deletedCodes.push(code);
    }
  }

  return {
    mode,
    appVersion: attr(rootNode, "AppVersion"),
    creator: attr(rootNode, "Creator"),
    warehouse: attr(rootNode, "Warehouse"),
    imageFolder: attr(rootNode, "ImageFolder"),
    defaultPrice: num(attr(rootNode, "DefaultPrice")),
    priceNames,
    products,
    deletedCodes,
    issues,
  };
}
