import { describe, expect, it } from "vitest";
import type { CustomerRecord } from "@/components/companies/customer-records-panel";
import { sortCustomerRecords } from "./customer-columns";

const records = [
  { id: "a", legal_name: "Alfa" },
  { id: "b", legal_name: "Beta" },
  { id: "c", legal_name: "Gamma" },
  { id: "d", legal_name: "Delta" },
] as CustomerRecord[];

const priceLists: Record<string, string> = {
  a: "Listino 2",
  b: "Listino 1",
  c: "Listino 2",
  d: "Nessuno · prezzi su richiesta",
};

const links: Record<string, string> = {
  a: "Non collegato",
  b: "Collegato",
  c: "Invito inviato",
  d: "Collegato",
};

describe("ordinamento anagrafica clienti", () => {
  it("ordina Listino dalla A alla Z usando il testo visibile", () => {
    const sorted = sortCustomerRecords(
      records,
      { key: "price_list", asc: true },
      { price_list: (record) => priceLists[record.id] ?? "" },
    );
    expect(sorted.map((record) => record.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("ordina Collegamento dalla A alla Z usando il testo visibile", () => {
    const sorted = sortCustomerRecords(
      records,
      { key: "link", asc: true },
      { link: (record) => links[record.id] ?? "" },
    );
    expect(sorted.map((record) => record.id)).toEqual(["b", "d", "c", "a"]);
  });

  it("inverte davvero Collegamento dalla Z alla A", () => {
    const sorted = sortCustomerRecords(
      records,
      { key: "link", asc: false },
      { link: (record) => links[record.id] ?? "" },
    );
    expect(sorted.map((record) => record.id)).toEqual(["a", "c", "b", "d"]);
  });
});
