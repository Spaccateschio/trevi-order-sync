// Dati inventati per il mockup Collaboratori e Reparti: nessun collegamento ai dati reali.

export const AREAS = [
  { id: "inventario", label: "Inventario" },
  { id: "lista", label: "Lista della Spesa" },
  { id: "ordini", label: "Ordini fornitori" },
  { id: "carico", label: "Carico merce" },
  { id: "preparazione", label: "Preparazione" },
  { id: "consegne", label: "Consegne e giri" },
  { id: "prodotti", label: "Prodotti" },
  { id: "fornitori", label: "Fornitori" },
] as const;
export type AreaId = (typeof AREAS)[number]["id"];

export const ACTIONS = [
  { id: "vedere", label: "Visualizzare" },
  { id: "creare", label: "Creare" },
  { id: "modificare", label: "Modificare" },
  { id: "confermare", label: "Confermare" },
  { id: "inviare", label: "Inviare" },
  { id: "annullare", label: "Annullare" },
  { id: "eliminare", label: "Eliminare" },
  { id: "stampare", label: "Stampare" },
] as const;
export type ActionId = (typeof ACTIONS)[number]["id"];

export type Permissions = Record<AreaId, ActionId[]>;
export type Extras = { prezzi: boolean; gestioneFornitori: boolean };

export type PresetId =
  | "super"
  | "amministratore"
  | "preparatore"
  | "magazziniere"
  | "compratore"
  | "trasportatore";

const ALL: ActionId[] = ACTIONS.map((a) => a.id);
const none = (): Permissions =>
  Object.fromEntries(AREAS.map((a) => [a.id, [] as ActionId[]])) as unknown as Permissions;
const full = (): Permissions =>
  Object.fromEntries(AREAS.map((a) => [a.id, [...ALL]])) as unknown as Permissions;

export const PRESETS: Record<
  PresetId,
  { label: string; description: string; permissions: () => Permissions; extras: Extras }
> = {
  super: {
    label: "Super amministratore",
    description: "Titolare: tutto, compresi i permessi degli amministratori.",
    permissions: full,
    extras: { prezzi: true, gestioneFornitori: true },
  },
  amministratore: {
    label: "Amministratore",
    description: "Tutte le operazioni e i collaboratori, non il super amministratore.",
    permissions: full,
    extras: { prezzi: true, gestioneFornitori: true },
  },
  preparatore: {
    label: "Preparatore",
    description: "Preparazione ordini clienti e stampa.",
    permissions: () => ({ ...none(), preparazione: ["vedere", "modificare", "confermare", "stampare"] }),
    extras: { prezzi: false, gestioneFornitori: false },
  },
  magazziniere: {
    label: "Magazziniere",
    description: "Inventario, giacenze e carico merce.",
    permissions: () => ({
      ...none(),
      inventario: ["vedere", "creare", "modificare", "confermare", "stampare"],
      carico: ["vedere", "creare", "modificare", "confermare", "stampare"],
      prodotti: ["vedere"],
    }),
    extras: { prezzi: false, gestioneFornitori: false },
  },
  compratore: {
    label: "Compratore",
    description: "Liste della Spesa e ordini ai fornitori dei reparti assegnati.",
    permissions: () => ({
      ...none(),
      inventario: ["vedere"],
      lista: ["vedere", "creare", "modificare", "confermare", "stampare"],
      ordini: ["vedere", "creare", "modificare", "inviare", "stampare"],
      prodotti: ["vedere"],
      fornitori: ["vedere"],
    }),
    extras: { prezzi: true, gestioneFornitori: false },
  },
  trasportatore: {
    label: "Trasportatore",
    description: "Consegne e gestione dei giri.",
    permissions: () => ({ ...none(), consegne: ["vedere", "modificare", "confermare", "stampare"] }),
    extras: { prezzi: false, gestioneFornitori: false },
  },
};

export type Department = { id: string; name: string; active: boolean };

export const DEMO_DEPARTMENTS: Department[] = [
  { id: "ort", name: "Ortofrutta", active: true },
  { id: "bev", name: "Bevande", active: true },
  { id: "ali", name: "Alimentari", active: true },
  { id: "mat", name: "Materiali", active: true },
];

export const DEMO_SUPPLIERS = ["Ortofrutta Rossi (demo)", "Bevande Bianchi (demo)", "Ingrosso Verdi (demo)"];

export type SupplierRule = { supplier: string; mode: "consentito" | "solo_vedere" | "escluso" };

export type Collaborator = {
  id: string;
  name: string;
  email: string;
  status: "attivo" | "invitato" | "disattivato";
  presets: PresetId[];
  departments: string[];
  /** Reparto principale per il conteggio: evita doppi conteggi. */
  permissions: Permissions;
  extras: Extras;
  supplierRules: SupplierRule[];
};

/** Profili combinabili: unione delle azioni. */
export function combinePresets(ids: PresetId[]): { permissions: Permissions; extras: Extras } {
  const permissions = none();
  const extras: Extras = { prezzi: false, gestioneFornitori: false };
  for (const id of ids) {
    const p = PRESETS[id].permissions();
    for (const a of AREAS) permissions[a.id] = Array.from(new Set([...permissions[a.id], ...p[a.id]]));
    extras.prezzi ||= PRESETS[id].extras.prezzi;
    extras.gestioneFornitori ||= PRESETS[id].extras.gestioneFornitori;
  }
  return { permissions, extras };
}

function make(id: string, name: string, email: string, presets: PresetId[], departments: string[], status: Collaborator["status"] = "attivo", supplierRules: SupplierRule[] = []): Collaborator {
  return { id, name, email, status, presets, departments, supplierRules, ...combinePresets(presets) };
}

export const DEMO_COLLABORATORS: Collaborator[] = [
  make("c1", "Mario Titolare (demo)", "titolare@esempio.it", ["super"], DEMO_DEPARTMENTS.map((d) => d.id)),
  make("c2", "Giulia Compratrice (demo)", "giulia@esempio.it", ["compratore"], ["ort", "bev"], "attivo", [
    { supplier: "Ingrosso Verdi (demo)", mode: "solo_vedere" },
  ]),
  make("c3", "Luca Magazzino (demo)", "luca@esempio.it", ["magazziniere"], ["ali", "mat"]),
  make("c4", "Sara Preparazione (demo)", "sara@esempio.it", ["preparatore", "trasportatore"], ["ort"]),
  make("c5", "Paolo Nuovo (demo)", "paolo@esempio.it", ["trasportatore"], [], "invitato"),
];

export type DemoListRow = { product: string; qty: string; supplier: string; department: string };

export const DEMO_LIST_ROWS: DemoListRow[] = [
  { product: "Pomodori ciliegino", qty: "4 cassette", supplier: "Ortofrutta Rossi (demo)", department: "ort" },
  { product: "Basilico", qty: "10 mazzi", supplier: "Ortofrutta Rossi (demo)", department: "ort" },
  { product: "Acqua naturale 1,5 L", qty: "6 fardelli", supplier: "Bevande Bianchi (demo)", department: "bev" },
  { product: "Succo di arancia", qty: "2 cartoni", supplier: "Ingrosso Verdi (demo)", department: "bev" },
  { product: "Pasta di semola", qty: "3 cartoni", supplier: "Ingrosso Verdi (demo)", department: "ali" },
  { product: "Sacchetti carta", qty: "1 pacco", supplier: "Ingrosso Verdi (demo)", department: "mat" },
];
