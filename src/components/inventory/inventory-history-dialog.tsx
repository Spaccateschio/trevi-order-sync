import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { dateTimeShort, qty, type SessionRow } from "@/lib/inventory";

/** Nome di chi ha aperto l'inventario; null se il profilo non è leggibile. */
export async function sessionAuthorName(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("user_id", userId)
    .maybeSingle();
  const name = [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}

type HistorySession = SessionRow & { counted: number; author: string | null };

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Stampa i conteggi di una sola sessione: legge i dati esistenti, nessuna copia. */
async function printSession(session: HistorySession) {
  const win = window.open("", "_blank");
  if (!win) return;
  const { data, error } = await supabase
    .from("inventory_counts")
    .select("counted_quantity, unit_code, products(code, description, danea_um), inventory_locations(name)")
    .eq("session_id", session.id);
  if (error) {
    win.close();
    throw new Error(error.message);
  }
  type Row = {
    counted_quantity: number;
    unit_code: string | null;
    products: { code: string; description: string | null; danea_um: string | null } | null;
    inventory_locations: { name: string } | null;
  };
  const rows = ((data ?? []) as unknown as Row[]).sort((a, b) =>
    (a.products?.description ?? "").localeCompare(b.products?.description ?? "", "it"),
  );
  const when = dateTimeShort(session.finished_at ?? session.started_at);
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Inventario ${escapeHtml(when)}</title>
<style>body{font-family:system-ui,sans-serif;padding:16px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ccc;padding:4px 6px;text-align:left;font-size:12px}td.n{text-align:right}</style>
</head><body><h1 style="font-size:18px">Inventario del ${escapeHtml(when)}</h1>
<p style="font-size:12px">${escapeHtml(session.author ? `Fatto da ${session.author} · ` : "")}${session.counted} prodotti contati</p>
<table><thead><tr><th>Prodotto</th><th>Zona</th><th class="n">Quantità</th><th>U.M.</th></tr></thead><tbody>
${rows
  .map(
    (r) =>
      `<tr><td>${escapeHtml(r.products?.description ?? r.products?.code ?? "")}</td><td>${escapeHtml(r.inventory_locations?.name ?? "")}</td><td class="n">${escapeHtml(qty(Number(r.counted_quantity)))}</td><td>${escapeHtml(r.unit_code?.trim() || r.products?.danea_um?.trim() || "")}</td></tr>`,
  )
  .join("")}
</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
  win.document.close();
}

/** Storico inventari raggruppato per sessione chiusa: data, autore, prodotti contati. */
export function InventoryHistoryDialog({
  companyId,
  archiveId,
  open,
  onOpenChange,
  onView,
}: {
  companyId: string;
  archiveId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onView: (session: SessionRow) => void;
}) {
  const historyQuery = useQuery({
    queryKey: ["inventory-history-sessions", companyId, archiveId],
    enabled: open && Boolean(archiveId),
    queryFn: async (): Promise<HistorySession[]> => {
      const { data, error } = await supabase
        .from("inventory_sessions")
        .select("id, name, scope, location_id, status, archive_id, started_at, finished_at, notes, created_by")
        .eq("company_id", companyId)
        .eq("archive_id", archiveId!)
        .eq("status", "completata")
        .order("finished_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      const sessions = data ?? [];
      if (!sessions.length) return [];
      const { data: counts, error: countsError } = await supabase
        .from("inventory_counts")
        .select("session_id, product_id")
        .in("session_id", sessions.map((s) => s.id));
      if (countsError) throw new Error(countsError.message);
      const perSession = new Map<string, Set<string>>();
      for (const row of counts ?? []) {
        const set = perSession.get(row.session_id) ?? new Set<string>();
        set.add(row.product_id);
        perSession.set(row.session_id, set);
      }
      const authors = new Map<string, string | null>();
      for (const id of new Set(sessions.map((s) => s.created_by).filter(Boolean) as string[])) {
        authors.set(id, await sessionAuthorName(id));
      }
      return sessions.map((s) => ({
        ...(s as SessionRow),
        counted: perSession.get(s.id)?.size ?? 0,
        author: s.created_by ? (authors.get(s.created_by) ?? null) : null,
      }));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Storico inventari</DialogTitle>
          <DialogDescription>Inventari chiusi, uno per sessione. Sola lettura.</DialogDescription>
        </DialogHeader>
        {historyQuery.isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}
        {historyQuery.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun inventario chiuso.</p>
        ) : null}
        <div className="space-y-2">
          {(historyQuery.data ?? []).map((session) => (
            <div key={session.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2">
              <div className="min-w-0 text-sm leading-tight">
                <p className="font-semibold">{dateTimeShort(session.finished_at ?? session.started_at)}</p>
                <p className="text-xs text-muted-foreground">
                  {session.author ? `${session.author} · ` : ""}
                  {session.counted} prodotti contati
                  {session.scope === "ubicazione" ? " · una zona" : ""}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => onView(session)}>
                  Visualizza
                </Button>
                <Button size="sm" variant="outline" onClick={() => void printSession(session)}>
                  <Printer aria-hidden="true" />
                  Stampa
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
