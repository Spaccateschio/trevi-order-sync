export type PlatformRequestStatus = "in_attesa" | "approvata" | "rifiutata" | "annullata";

/** Read state is independent from the linked entity's workflow. */
export type PlatformNotification = {
  id: string;
  category: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  destination: string;
  linkedRequest?: { status: PlatformRequestStatus };
};

export const platformRequestLabels: Record<PlatformRequestStatus, string> = {
  in_attesa: "In attesa", approvata: "Approvata", rifiutata: "Rifiutata", annullata: "Annullata",
};

export const platformNotificationDemoData: readonly PlatformNotification[] = [
  {
    id: "demo-new-request", category: "Richieste Vendo", title: "Nuova richiesta Vendo",
    body: "Azienda dimostrativa Alfa ha richiesto l’attivazione di Vendo.",
    createdAt: "2026-10-20T05:30:00Z", read: false,
    destination: "/piattaforma/richieste-vendo", linkedRequest: { status: "in_attesa" },
  },
  {
    id: "demo-cancelled-request", category: "Richieste Vendo", title: "Richiesta Vendo annullata",
    body: "Azienda dimostrativa Beta ha ritirato la richiesta.",
    createdAt: "2026-10-20T05:15:00Z", read: false,
    destination: "/piattaforma/richieste-vendo", linkedRequest: { status: "annullata" },
  },
  {
    id: "demo-approved-request", category: "Richieste Vendo", title: "Richiesta Vendo approvata",
    body: "La richiesta di Azienda dimostrativa Gamma risulta approvata.",
    createdAt: "2026-10-19T14:20:00Z", read: true,
    destination: "/piattaforma/richieste-vendo", linkedRequest: { status: "approvata" },
  },
  {
    id: "demo-rejected-request", category: "Richieste Vendo", title: "Richiesta Vendo rifiutata",
    body: "La richiesta di Azienda dimostrativa Delta è stata rifiutata. Motivo: Prova dimostrativa.",
    createdAt: "2026-10-19T10:10:00Z", read: true,
    destination: "/piattaforma/richieste-vendo", linkedRequest: { status: "rifiutata" },
  },
];

export function markPlatformNotificationsRead(items: readonly PlatformNotification[], ids: readonly string[]): PlatformNotification[] {
  const selected = new Set(ids);
  return items.map((item) => selected.has(item.id) ? { ...item, read: true } : item);
}