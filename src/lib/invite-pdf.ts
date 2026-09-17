import jsPDF from "jspdf";
import QRCode from "qrcode";

/**
 * Foglio invito stampabile: solo presentazione.
 * Non crea, modifica o valida inviti: riceve i dati già generati dal server.
 */
export type InvitePdfData = {
  /** Ragione sociale di chi invita. */
  sellerName: string;
  /** Email aziendale mostrata come contatto per assistenza. */
  sellerEmail?: string | null;
  sellerPhone?: string | null;
  /** Persona che ha generato l'invito, quando disponibile. */
  invitedBy?: string | null;
  /** Cliente destinatario dell'invito, quando disponibile. */
  recipientName?: string | null;
  inviteCode?: string | null;
  inviteLink: string;
  expiresAt?: string | null;
};

const MARGIN = 18;

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

async function drawPage(doc: jsPDF, data: InvitePdfData) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = MARGIN;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(data.sellerName, MARGIN, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text("Invito a collegarsi su Trevi Fruit", MARGIN, y + 13);
  doc.setTextColor(0);

  y += 22;
  doc.setDrawColor(200);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(
    data.recipientName ? `Gentile ${data.recipientName},` : "Gentile cliente,",
    MARGIN,
    y,
  );
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const intro = doc.splitTextToSize(
    `${data.sellerName} ti invita a collegarti su Trevi Fruit per gestire ordini, preparazione e consegne in modo più semplice. Inquadra il codice QR con la fotocamera del telefono oppure apri il link indicato per completare la registrazione.`,
    pageWidth - MARGIN * 2,
  );
  doc.text(intro, MARGIN, y);
  y += intro.length * 6 + 8;

  // QR + codice invito
  const qrSize = 58;
  const qrDataUrl = await QRCode.toDataURL(data.inviteLink, { margin: 1, width: 512 });
  doc.addImage(qrDataUrl, "PNG", MARGIN, y, qrSize, qrSize);

  const textX = MARGIN + qrSize + 10;
  let textY = y + 8;

  if (data.inviteCode) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text("Codice invito", textX, textY);
    doc.setTextColor(0);
    doc.setFont("courier", "bold");
    doc.setFontSize(22);
    doc.text(data.inviteCode, textX, textY + 10);
    textY += 20;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text("Link di registrazione", textX, textY + 2);
  doc.setTextColor(0);
  doc.setFontSize(9);
  const linkLines = doc.splitTextToSize(data.inviteLink, pageWidth - MARGIN - textX);
  doc.textWithLink(linkLines[0] ?? data.inviteLink, textX, textY + 8, { url: data.inviteLink });
  if (linkLines.length > 1) {
    doc.text(linkLines.slice(1), textX, textY + 13);
  }

  y += qrSize + 14;

  const expires = formatDate(data.expiresAt);
  doc.setFontSize(10);
  doc.setTextColor(110);
  if (expires) {
    doc.text(`L'invito è valido fino al ${expires}.`, MARGIN, y);
    y += 6;
  }
  doc.text(
    "Il collegamento diventa attivo solo dopo la tua accettazione e con partita IVA coerente.",
    MARGIN,
    y,
  );
  doc.setTextColor(0);
  y += 12;

  // Istruzioni passo per passo: riempiono la pagina e guidano il cliente.
  const boxHeight = 46;
  doc.setDrawColor(210);
  doc.roundedRect(MARGIN, y, pageWidth - MARGIN * 2, boxHeight, 3, 3);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Come collegarsi", MARGIN + 6, y + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const steps = [
    "1. Inquadra il codice QR con la fotocamera del telefono oppure apri il link.",
    "2. Se non hai ancora un account, registra la tua azienda: servono partita IVA, email e cellulare.",
    "3. Se hai già un account Trevi Fruit, accedi e inserisci il codice invito nella pagina Collegamenti.",
    "4. Conferma l'invito: il collegamento con noi diventa operativo subito dopo.",
  ];
  let stepY = y + 19;
  for (const step of steps) {
    const lines = doc.splitTextToSize(step, pageWidth - MARGIN * 2 - 12);
    doc.text(lines, MARGIN + 6, stepY);
    stepY += lines.length * 5 + 1.5;
  }

  // Piede: chi invita e contatti
  const footerY = doc.internal.pageSize.getHeight() - MARGIN - 20;
  doc.setDrawColor(200);
  doc.line(MARGIN, footerY, pageWidth - MARGIN, footerY);
  doc.setFontSize(10);
  const contact: string[] = [];
  if (data.invitedBy) contact.push(`Invito inviato da ${data.invitedBy} — ${data.sellerName}`);
  else contact.push(data.sellerName);
  const channels = [data.sellerEmail, data.sellerPhone].filter(Boolean) as string[];
  if (channels.length > 0) contact.push(`Per assistenza: ${channels.join(" · ")}`);
  doc.text(contact, MARGIN, footerY + 7);
}

function fileName(data: InvitePdfData) {
  const base = (data.recipientName || data.inviteCode || "invito")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `invito-${base || "cliente"}.pdf`;
}

/** Compone il documento (una pagina per invito) senza salvarlo. */
export async function renderInvitePdf(items: InvitePdfData[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  for (let index = 0; index < items.length; index += 1) {
    if (index > 0) doc.addPage();
    // eslint-disable-next-line no-await-in-loop
    await drawPage(doc, items[index]!);
  }
  return doc;
}

/** Genera e scarica il foglio invito (una pagina). */
export async function downloadInvitePdf(data: InvitePdfData) {
  const doc = await renderInvitePdf([data]);
  doc.save(fileName(data));
}

/** Genera un unico PDF con una pagina per invito (inviti multipli). */
export async function downloadInvitePdfBatch(items: InvitePdfData[], name = "inviti.pdf") {
  if (items.length === 0) return;
  const doc = await renderInvitePdf(items);
  doc.save(name);
}
