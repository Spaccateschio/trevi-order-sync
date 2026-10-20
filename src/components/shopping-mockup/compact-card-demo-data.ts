/** Dati finti per l'anteprima della card compatta: nessun legame con la Lista reale. */
export type DemoSupplier = { name: string; quantity: number };
export type DemoCard = {
  id: string;
  name: string;
  code: string;
  image: "verdura" | "pomodori" | "carote" | "frutta" | "basilico" | "patate-cipolle";
  favorite: boolean;
  status: "assegnato" | "da_inserire" | "da_sistemare";
  stock: number;
  lastCount: number;
  suggested: number;
  quantity: number | null;
  unit: string;
  units: string[];
  suppliers: DemoSupplier[];
  warning?: string;
};

export function createDemoCards(): DemoCard[] {
  return [
    { id: "a", name: "AGLIO SPAGNA", code: "00-013", image: "verdura", favorite: true, status: "assegnato", stock: 2, lastCount: 2, suggested: 0, quantity: 2, unit: "kg", units: ["kg", "cassa"], suppliers: [{ name: "Garbaglia", quantity: 2 }] },
    { id: "b", name: "POMODORO CILIEGINO", code: "00-041", image: "pomodori", favorite: true, status: "da_inserire", stock: 1, lastCount: 3, suggested: 0, quantity: null, unit: "cassa", units: ["cassa", "kg"], suppliers: [{ name: "Ortofrutta Roma", quantity: 0 }] },
    { id: "c", name: "CAROTE", code: "00-022", image: "carote", favorite: false, status: "assegnato", stock: 3, lastCount: 5, suggested: 8, quantity: 8, unit: "kg", units: ["kg"], suppliers: [{ name: "Garbaglia", quantity: 8 }] },
    { id: "d", name: "BASILICO", code: "00-077", image: "basilico", favorite: true, status: "da_sistemare", stock: 0, lastCount: 0, suggested: 0, quantity: 4, unit: "mazzo", units: ["mazzo", "kg"], suppliers: [{ name: "Verde Lazio", quantity: 4 }], warning: "U.M. «mazzo» da verificare col fornitore" },
    { id: "e", name: "PATATE E CIPOLLE", code: "00-005", image: "patate-cipolle", favorite: false, status: "assegnato", stock: 10, lastCount: 12, suggested: 0, quantity: 30, unit: "kg", units: ["kg", "sacco"], suppliers: [{ name: "Garbaglia", quantity: 20 }, { name: "Ortofrutta Roma", quantity: 10 }] },
  ];
}

/** Riga «Fornitore» a card chiusa: il primo + quanti altri. */
export function supplierSummary(card: DemoCard): string {
  const [first, ...rest] = card.suppliers;
  if (!first) return "—";
  return rest.length ? `${first.name} + ${rest.length}` : first.name;
}

/** La Suggerita si mostra solo se maggiore di zero. */
export function showSuggested(card: DemoCard): boolean {
  return card.suggested > 0;
}

/** Una sola card aperta alla volta. */
export function toggleOpen(current: string | null, id: string): string | null {
  return current === id ? null : id;
}
