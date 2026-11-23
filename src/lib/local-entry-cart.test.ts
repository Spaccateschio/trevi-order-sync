import { describe, expect, it, vi } from "vitest";
import { bulkB2bSupplierNames, clearEntryCartDraft, confirmedLinesWithoutDrafts, entryCartLinesBySupplier, entryCartMetrics, entryCartStorageKey, readEntryCartDraft, saveEntryCartInGroups, writeEntryCartDraft } from "./local-entry-cart";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("bozza locale del carrello", () => {
  it("separa utente, azienda, area e lista/conteggio", () => {
    const key = entryCartStorageKey({ userId: "u1", companyId: "c1", area: "lista", referenceId: "l1" });
    expect(key).toBe("efficio-entry-cart:v1:u1:c1:lista:l1");
    expect(key).not.toBe(entryCartStorageKey({ userId: "u1", companyId: "c1", area: "inventario", referenceId: "l1" }));
  });

  it("scarta la bozza e cancella la copia locale prima di continuare", () => {
    const storage = memoryStorage();
    expect(writeEntryCartDraft(storage, "k", { drafts: { a: "2" } })).toBe(true);
    expect(readEntryCartDraft(storage, "k", (value) => {
      if (!value || typeof value !== "object" || !("drafts" in value)) return null;
      return value as { drafts: Record<string, string> };
    })).toEqual({ drafts: { a: "2" } });
    clearEntryCartDraft(storage, "k");
    expect(readEntryCartDraft(storage, "k", () => ({}))).toBeNull();
  });

  it("conta prodotti e fornitori senza doppioni", () => {
    expect(entryCartMetrics([
      { id: "a", productId: "p1", supplierNames: ["F1", "F2"] },
      { id: "b", productId: "p1", supplierNames: ["F1"] },
      { id: "c", productId: "p2" },
    ])).toEqual({ products: 2, suppliers: 2 });
  });

  it("divide il riepilogo per fornitore e ripete solo le righe con più fornitori", () => {
    const groups = entryCartLinesBySupplier([
      { id: "basilico", supplierNames: ["trevi srl"] },
      { id: "aglio", supplierNames: ["Cartoleria Viva", "trevi srl"] },
      { id: "uva", supplierNames: [], noSupplierReason: "nessun fornitore collegato" },
    ]);
    expect(groups.map((group) => [group.supplier, group.lines.map((line) => line.id)])).toEqual([
      ["Cartoleria Viva", ["aglio"]],
      ["Senza fornitore — nessun fornitore collegato", ["uva"]],
      ["trevi srl", ["basilico", "aglio"]],
    ]);
  });

  it("include nell'invio multiplo soltanto i fornitori B2B", () => {
    const groups = [{ supplier: "Caffetteria Bianco&Nero" }, { supplier: "Cartoleria Viva" }, { supplier: "trevi srl" }];
    expect(bulkB2bSupplierNames(groups, new Set(["trevi srl"]))).toEqual(["trevi srl"]);
  });

  it("mostra i confermati e sposta nelle bozze solo la riga modificata", () => {
    const confirmed = [
      { id: "list:a", productId: "a", supplierNames: ["Fornitore 1"] },
      { id: "list:b", productId: "b", supplierNames: ["Fornitore 2"] },
    ];
    expect(confirmedLinesWithoutDrafts(confirmed, [{ id: "list:a" }])).toEqual([confirmed[1]]);
    expect(entryCartMetrics(confirmed)).toEqual({ products: 2, suppliers: 2 });
  });
});

describe("salvataggio finale a gruppi paralleli", () => {
  it("continua dopo un rifiuto e conserva l'errore della sola riga", async () => {
    const progress: number[] = [];
    const errors = await saveEntryCartInGroups({
      lines: [{ id: "a" }, { id: "b" }, { id: "c" }],
      keyOf: (line) => line.id,
      groupSize: 2,
      worker: async (line) => { if (line.id === "b") throw new Error("Riga rifiutata"); },
      onProgress: (done) => progress.push(done),
    });
    expect(errors).toEqual({ b: "Riga rifiutata" });
    expect(progress).toEqual([0, 1, 2, 3]);
  });

  it("non supera il numero di richieste parallele del gruppo", async () => {
    let running = 0;
    let maximum = 0;
    const release: (() => void)[] = [];
    const pending = saveEntryCartInGroups({
      lines: [1, 2, 3, 4], keyOf: String, groupSize: 2,
      worker: async () => { running += 1; maximum = Math.max(maximum, running); await new Promise<void>((resolve) => release.push(() => { running -= 1; resolve(); })); },
    });
    await vi.waitFor(() => expect(release).toHaveLength(2));
    release.forEach((resolve) => resolve());
    await vi.waitFor(() => expect(release).toHaveLength(4));
    release.slice(2).forEach((resolve) => resolve());
    await pending;
    expect(maximum).toBe(2);
  });
});
