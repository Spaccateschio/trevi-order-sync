/**
 * Dati di esempio per i mockup dell'area «Amministrazione piattaforma».
 * Nessun dato reale: nomi, aziende ed eventi sono inventati.
 * Quando si farà il back end, questo file verrà sostituito dalle letture reali.
 */

export type MockCompany = {
  id: string;
  name: string;
  city: string;
  profile: "Compra" | "Vende" | "Compra e vende";
  status: "attiva" | "in_prova" | "sospesa";
  users: number;
  ordersMonth: number;
  registeredAt: string;
  lastActivity: string;
};

export type MockUser = {
  id: string;
  name: string;
  email: string;
  company: string;
  role: "amministratore" | "operatore" | "trasportatore";
  lastAccess: string;
  status: "attivo" | "disattivato";
};

export type MockEvent = {
  id: string;
  at: string;
  company: string;
  user: string;
  action: string;
  detail: string;
  kind: "ordine" | "consegna" | "accesso" | "anagrafica" | "sistema";
};

export type MockTeamMember = {
  id: string;
  name: string;
  email: string;
  addedAt: string;
  permissions: Record<MockSection, "vedere" | "modificare" | "niente">;
};

export type MockSection =
  | "pannello"
  | "aziende"
  | "utenti"
  | "registro"
  | "assistenza"
  | "impostazioni";

export const MOCK_SECTIONS: { key: MockSection; label: string }[] = [
  { key: "pannello", label: "Pannello principale" },
  { key: "aziende", label: "Aziende" },
  { key: "utenti", label: "Utenti" },
  { key: "registro", label: "Registro eventi" },
  { key: "assistenza", label: "Assistenza" },
  { key: "impostazioni", label: "Impostazioni piattaforma" },
];

export const MOCK_COMPANIES: MockCompany[] = [
  {
    id: "c1",
    name: "3 EMME ROMA SRL",
    city: "Roma",
    profile: "Compra",
    status: "attiva",
    users: 4,
    ordersMonth: 38,
    registeredAt: "02/09/2026",
    lastActivity: "Oggi, 09:12",
  },
  {
    id: "c2",
    name: "trevi srl",
    city: "Roma",
    profile: "Compra e vende",
    status: "attiva",
    users: 7,
    ordersMonth: 121,
    registeredAt: "14/08/2026",
    lastActivity: "Oggi, 08:47",
  },
  {
    id: "c3",
    name: "Breda Caffè Torrefazione",
    city: "Roma",
    profile: "Vende",
    status: "attiva",
    users: 2,
    ordersMonth: 12,
    registeredAt: "21/09/2026",
    lastActivity: "Ieri, 17:03",
  },
  {
    id: "c4",
    name: "Ortofrutta Colli Albani",
    city: "Albano Laziale",
    profile: "Vende",
    status: "in_prova",
    users: 1,
    ordersMonth: 0,
    registeredAt: "10/10/2026",
    lastActivity: "12/10/2026",
  },
  {
    id: "c5",
    name: "Ristorante Da Enzo",
    city: "Roma",
    profile: "Compra",
    status: "sospesa",
    users: 3,
    ordersMonth: 5,
    registeredAt: "30/08/2026",
    lastActivity: "28/09/2026",
  },
];

export const MOCK_USERS: MockUser[] = [
  {
    id: "u1",
    name: "Andrea Amato",
    email: "andrea@esempio.it",
    company: "3 EMME ROMA SRL",
    role: "amministratore",
    lastAccess: "Oggi, 09:12",
    status: "attivo",
  },
  {
    id: "u2",
    name: "Marco Rossi",
    email: "marco.rossi@esempio.it",
    company: "trevi srl",
    role: "amministratore",
    lastAccess: "Oggi, 08:47",
    status: "attivo",
  },
  {
    id: "u3",
    name: "Lucia Bianchi",
    email: "lucia.b@esempio.it",
    company: "trevi srl",
    role: "operatore",
    lastAccess: "Ieri, 18:22",
    status: "attivo",
  },
  {
    id: "u4",
    name: "Giuseppe Verdi",
    email: "g.verdi@esempio.it",
    company: "3 EMME ROMA SRL",
    role: "trasportatore",
    lastAccess: "Ieri, 11:05",
    status: "attivo",
  },
  {
    id: "u5",
    name: "Sara Neri",
    email: "sara.neri@esempio.it",
    company: "Breda Caffè Torrefazione",
    role: "amministratore",
    lastAccess: "Ieri, 17:03",
    status: "attivo",
  },
  {
    id: "u6",
    name: "Paolo Fontana",
    email: "p.fontana@esempio.it",
    company: "Ristorante Da Enzo",
    role: "operatore",
    lastAccess: "28/09/2026",
    status: "disattivato",
  },
];

export const MOCK_EVENTS: MockEvent[] = [
  {
    id: "e1",
    at: "Oggi, 09:12",
    company: "3 EMME ROMA SRL",
    user: "Andrea Amato",
    action: "Ordine inviato",
    detail: "ORD-2026-00006 inviato a trevi srl",
    kind: "ordine",
  },
  {
    id: "e2",
    at: "Oggi, 08:47",
    company: "trevi srl",
    user: "Marco Rossi",
    action: "Consegna accettata",
    detail: "Consegna su ORD-2026-00002 accettata, 14 articoli caricati",
    kind: "consegna",
  },
  {
    id: "e3",
    at: "Ieri, 18:22",
    company: "trevi srl",
    user: "Lucia Bianchi",
    action: "Prezzo modificato",
    detail: "Listino B2B: POMODORI CILIEGINO IT da 1,80 a 1,85",
    kind: "anagrafica",
  },
  {
    id: "e4",
    at: "Ieri, 17:03",
    company: "Breda Caffè Torrefazione",
    user: "Sara Neri",
    action: "Accesso",
    detail: "Accesso effettuato da smartphone",
    kind: "accesso",
  },
  {
    id: "e5",
    at: "Ieri, 11:05",
    company: "3 EMME ROMA SRL",
    user: "Giuseppe Verdi",
    action: "Consegna completata",
    detail: "Giro consegne: 3 fermate completate",
    kind: "consegna",
  },
  {
    id: "e6",
    at: "12/10/2026",
    company: "Ortofrutta Colli Albani",
    user: "—",
    action: "Registrazione azienda",
    detail: "Nuova azienda registrata, in prova",
    kind: "sistema",
  },
  {
    id: "e7",
    at: "10/10/2026",
    company: "Ristorante Da Enzo",
    user: "—",
    action: "Azienda sospesa",
    detail: "Sospesa dal super amministratore: pagamento mancato",
    kind: "sistema",
  },
];

export const MOCK_TEAM: MockTeamMember[] = [
  {
    id: "t1",
    name: "Andrea Amato",
    email: "andrea@piattaforma.it",
    addedAt: "01/08/2026",
    permissions: {
      pannello: "modificare",
      aziende: "modificare",
      utenti: "modificare",
      registro: "vedere",
      assistenza: "modificare",
      impostazioni: "modificare",
    },
  },
  {
    id: "t2",
    name: "Elena Supporti",
    email: "elena@piattaforma.it",
    addedAt: "15/09/2026",
    permissions: {
      pannello: "vedere",
      aziende: "vedere",
      utenti: "vedere",
      registro: "vedere",
      assistenza: "modificare",
      impostazioni: "niente",
    },
  },
  {
    id: "t3",
    name: "Davide Conti",
    email: "davide@piattaforma.it",
    addedAt: "02/10/2026",
    permissions: {
      pannello: "vedere",
      aziende: "vedere",
      utenti: "niente",
      registro: "vedere",
      assistenza: "vedere",
      impostazioni: "niente",
    },
  },
];

export const MOCK_STATS = {
  companies: MOCK_COMPANIES.length,
  activeCompanies: MOCK_COMPANIES.filter((c) => c.status === "attiva").length,
  users: MOCK_USERS.length,
  ordersToday: 9,
  ordersMonth: 176,
  eventsToday: 14,
};
