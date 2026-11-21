export type SupportRequestKind = "assistenza" | "miglioramento";
export type SupportRequestStatus = "nuova" | "in_lavorazione" | "risolta";

export interface SupportRequestMock {
  id: string;
  kind: SupportRequestKind;
  status: SupportRequestStatus;
  title: string;
  details: string;
  author: string;
  company: string;
  page: string;
  createdAt: string;
  screenshotName?: string;
  adminReply?: string;
}

export const MOCK_SUPPORT_REQUESTS: SupportRequestMock[] = [
  {
    id: "DEMO-001",
    kind: "assistenza",
    status: "nuova",
    title: "Non riesco a confermare una quantità",
    details: "Dopo avere inserito la quantità, il pulsante Conferma non completa l’operazione.",
    author: "Mario Rossi",
    company: "Azienda Dimostrativa",
    page: "Lista della Spesa",
    createdAt: "Oggi, 09:42",
    screenshotName: "errore-quantita.png",
  },
  {
    id: "DEMO-002",
    kind: "miglioramento",
    status: "in_lavorazione",
    title: "Ricordare l’ultimo fornitore usato",
    details: "Sarebbe utile trovare già selezionato il fornitore usato per l’ultimo acquisto.",
    author: "Laura Bianchi",
    company: "Esempio Ortofrutta",
    page: "Ordini fornitori",
    createdAt: "Ieri, 16:18",
    adminReply: "Grazie per il suggerimento: stiamo valutando come inserirlo senza cambiare le scelte già fatte.",
  },
  {
    id: "DEMO-003",
    kind: "assistenza",
    status: "risolta",
    title: "Invito del collaboratore non ricevuto",
    details: "Il collaboratore non trovava il messaggio con il collegamento per accedere.",
    author: "Giuseppe Verdi",
    company: "Mercato di Prova",
    page: "Collaboratori",
    createdAt: "18 novembre, 11:05",
    adminReply: "Il messaggio era nella cartella Spam. L’invito è stato aperto correttamente.",
  },
];

export function supportKindLabel(kind: SupportRequestKind): string {
  return kind === "assistenza" ? "Assistenza" : "Miglioramento";
}

export function supportStatusLabel(status: SupportRequestStatus): string {
  if (status === "nuova") return "Nuova";
  if (status === "in_lavorazione") return "In lavorazione";
  return "Risolta";
}

export function filterSupportRequests(
  requests: SupportRequestMock[],
  filters: {
    query?: string;
    kind?: SupportRequestKind | "tutti";
    status?: SupportRequestStatus | "tutte";
  },
): SupportRequestMock[] {
  const query = filters.query?.trim().toLocaleLowerCase("it") ?? "";
  return requests.filter((request) => {
    if (filters.kind && filters.kind !== "tutti" && request.kind !== filters.kind) return false;
    if (filters.status && filters.status !== "tutte" && request.status !== filters.status) return false;
    if (!query) return true;
    return [request.id, request.title, request.details, request.author, request.company, request.page]
      .join(" ")
      .toLocaleLowerCase("it")
      .includes(query);
  });
}

export function createLocalSupportRequest(
  input: {
    kind: SupportRequestKind;
    title: string;
    details: string;
    page: string;
    screenshotName?: string;
  },
  sequence: number,
): SupportRequestMock {
  return {
    id: `DEMO-${String(sequence).padStart(3, "0")}`,
    kind: input.kind,
    status: "nuova",
    title: input.title.trim(),
    details: input.details.trim(),
    author: "Tu",
    company: "La tua azienda",
    page: input.page,
    createdAt: "Adesso",
    ...(input.screenshotName ? { screenshotName: input.screenshotName } : {}),
  };
}
