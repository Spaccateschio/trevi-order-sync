import {
  preparationStatus,
  type PreparationBundle,
  type PreparationOrder,
} from "@/lib/preparation";

const esc = (value: unknown) =>
  String(value ?? "—").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
const number = (value: number | null) =>
  value === null ? "—" : new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 }).format(value);
export function preparationPrintHtml(
  orders: PreparationOrder[],
  members: PreparationBundle["members"],
) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Preparazione ordini — Trevi Fruit</title>
  <style>@page{margin:14mm}body{font-family:system-ui,sans-serif;color:CanvasText;background:Canvas;margin:0}section{break-after:page}section:last-child{break-after:auto}h1{font-size:18pt}p{font-size:11pt}table{width:100%;border-collapse:collapse}th,td{border:1px solid currentColor;padding:8px;text-align:left;font-size:12pt}tr{break-inside:avoid}thead{display:table-header-group}.missing{font-weight:700}</style></head><body>${orders.map((o) => `<section><h1>${esc(o.customer)} — ${esc(o.number)}</h1><p>Consegna: ${esc(o.deliveryDate)} · ${esc(o.timeFrom?.slice(0, 5))}${o.timeTo ? `–${esc(o.timeTo.slice(0, 5))}` : ""}</p><p>${esc(o.address)}</p><p>${preparationStatus(o)} · Preparatore: ${esc(members.find((m) => m.id === o.assignedMemberId)?.name ?? "Non assegnato")}</p>${o.notes ? `<p>Note: ${esc(o.notes)}</p>` : ""}<table><thead><tr><th>Articolo</th><th>Richiesto</th><th>Preparato</th><th>Peso kg</th><th>Stato</th></tr></thead><tbody>${o.lines.map((l) => `<tr class="${l.state === "missing" ? "missing" : ""}"><td>${esc(l.name)}${l.notes ? `<br>${esc(l.notes)}` : ""}</td><td>${number(l.requested)} ${esc(l.unit)}</td><td>${number(l.prepared)} ${esc(l.unit)}</td><td>${number(l.weight)}</td><td>${l.sourceChanged ? "Ordine modificato — da verificare" : l.state === "missing" ? "MANCANTE" : l.state === "confirmed" ? "Confermato" : "Da preparare"}</td></tr>`).join("")}</tbody></table><p>Trevi Fruit · Dati di preparazione salvati${o.exportedAt ? " · Scaricato da Danea" : ""}</p></section>`).join("")}</body></html>`;
}
export function printPreparation(
  orders: PreparationOrder[],
  members: PreparationBundle["members"],
) {
  if (!orders.length) return;
  const html = preparationPrintHtml(orders, members);
  const isTouch = window.matchMedia?.("(pointer: coarse)").matches;
  // Su telefoni/tablet la stampa da iframe nascosto spesso non parte: si apre una finestra.
  if (isTouch) {
    const popup = window.open("", "_blank");
    if (popup) {
      popup.document.open();
      popup.document.write(
        html.replace("</body>", "<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body>"),
      );
      popup.document.close();
      return;
    }
  }
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => frame.remove();
  frame.contentWindow?.addEventListener("afterprint", cleanup);
  window.setTimeout(cleanup, 60000);
  window.setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  }, 300);
}
