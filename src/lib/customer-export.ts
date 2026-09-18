import type { CustomerRecord } from "@/components/companies/customer-records-panel";
import type { CustomerColumn } from "@/lib/customer-columns";

type ExportContext = {
  columns: CustomerColumn[];
  records: CustomerRecord[];
  priceListLabel: (record: CustomerRecord) => string;
  linkLabel: (record: CustomerRecord) => string;
};

function valueFor(
  column: CustomerColumn,
  record: CustomerRecord,
  context: Pick<ExportContext, "priceListLabel" | "linkLabel">,
) {
  if (column.key === "price_list") return context.priceListLabel(record);
  if (column.key === "link") return context.linkLabel(record);
  return column.value(record);
}

function rowsFor(context: ExportContext) {
  return context.records.map((record) =>
    Object.fromEntries(
      context.columns.map((column) => [column.label, valueFor(column, record, context)]),
    ),
  );
}

function filename(extension: string) {
  const date = new Intl.DateTimeFormat("sv-SE").format(new Date());
  return `clienti-selezionati-${date}.${extension}`;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadCustomersCsv(context: ExportContext) {
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [
    context.columns.map((column) => escape(column.label)).join(";"),
    ...context.records.map((record) =>
      context.columns.map((column) => escape(valueFor(column, record, context))).join(";"),
    ),
  ];
  downloadBlob(
    new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }),
    filename("csv"),
  );
}

export async function downloadCustomersExcel(context: ExportContext) {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.json_to_sheet(rowsFor(context));
  worksheet["!cols"] = context.columns.map((column) => ({
    wch: Math.max(10, Math.min(34, column.label.length + 8)),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Clienti");
  XLSX.writeFile(workbook, filename("xlsx"));
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function printCustomers(context: ExportContext) {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) throw new Error("Consenti l’apertura della finestra di stampa.");
  const header = context.columns.map((column) => `<th>${htmlEscape(column.label)}</th>`).join("");
  const body = context.records
    .map(
      (record) =>
        `<tr>${context.columns
          .map((column) => `<td>${htmlEscape(valueFor(column, record, context))}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  popup.document.write(`<!doctype html><html lang="it"><head><title>Clienti selezionati</title><style>
    @page{size:A4 landscape;margin:8mm}body{font-family:Arial,sans-serif;margin:0;color:#111}
    h1{font-size:14px;margin:0 0 8px}p{font-size:9px;margin:0 0 8px;color:#555}
    table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7px}
    thead{display:table-header-group}th,td{border:1px solid #999;padding:3px;overflow-wrap:anywhere}
    th{background:#eee;text-align:left}tr{break-inside:avoid}
  </style></head><body><h1>Clienti selezionati</h1><p>${context.records.length} clienti · ${context.columns.length} colonne</p><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>{window.print();window.close()}</script></body></html>`);
  popup.document.close();
}