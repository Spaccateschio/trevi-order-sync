import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShoppingBag } from "lucide-react";
import { useState } from "react";

import { DirectPurchaseDraftDialog, STATUS_LABEL } from "@/components/purchase/direct-purchase-draft-dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getGenerationPreview } from "@/lib/order-generation.functions";

const GROUPS = [
  { key: "bozza", title: "Bozze" },
  { key: "confermato", title: "Confermati" },
  { key: "annullato", title: "Annullati" },
] as const;

/**
 * Acquisti diretti (AD) dell'azienda, anche di Liste chiuse. Sola lettura: apre la finestra AD esistente.
 * Per le bozze passa le quote attuali della Lista (stessa lettura di «Genera ordini»), così la finestra
 * segnala le differenze e blocca la conferma con il suo controllo già esistente.
 */
export function DirectPurchasesSection({ companyId }: { companyId: string }) {
  const readPreview = useServerFn(getGenerationPreview);
  const [open, setOpen] = useState<{ id: string; listId: string | null; status: string } | null>(null);

  const docs = useQuery({
    queryKey: ["direct-purchases-list", "company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_purchases")
        .select("id, number, status, created_at, purchase_date, buyer_label, shopping_list_id, direct_purchase_items(id)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const needsQuotas = open?.status === "bozza" && !!open.listId;
  const quotas = useQuery({
    queryKey: ["generation-preview", open?.listId],
    enabled: needsQuotas,
    queryFn: () => readPreview({ data: { listId: open!.listId as string } }),
  });

  const ready = !needsQuotas || quotas.isSuccess;
  const currentQuotas = Object.fromEntries(
    (quotas.data?.direct ?? []).map((x) => [x.item_id, { quantity: x.quantity, unit_code: x.unit_code, done: x.done }]),
  );

  const rows = docs.data ?? [];
  const date = (d: string) => new Date(d).toLocaleDateString("it-IT");

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <ShoppingBag className="size-5" /> Acquisti diretti
      </h2>
      {docs.isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}
      {docs.error ? <p className="text-sm text-destructive">{(docs.error as Error).message}</p> : null}
      {GROUPS.map((g) => {
        const list = rows.filter((r) => r.status === g.key);
        return (
          <div key={g.key} className="space-y-2">
            <h3 className="text-base font-semibold">
              {g.title} — {list.length}
            </h3>
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun documento.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {list.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setOpen({ id: r.id, listId: r.shopping_list_id, status: r.status })}
                    className="rounded-lg border border-border bg-card p-3 text-left hover:bg-accent"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{r.number}</span>
                      <Badge variant={r.status === "bozza" ? "default" : "secondary"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {date(r.purchase_date ?? r.created_at)} · {r.buyer_label || "Chi acquista non indicato"} ·{" "}
                      {r.direct_purchase_items.length} {r.direct_purchase_items.length === 1 ? "prodotto" : "prodotti"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {open && needsQuotas && quotas.isLoading ? <p className="text-sm text-muted-foreground">Controllo quantità della Lista…</p> : null}
      {open && needsQuotas && quotas.error ? (
        <p className="text-sm text-destructive">
          Non riesco a controllare le quantità della Lista: il documento non può essere aperto. {(quotas.error as Error).message}
        </p>
      ) : null}
      <DirectPurchaseDraftDialog
        docId={open && ready ? open.id : null}
        companyId={companyId}
        currentQuotas={currentQuotas}
        onOpenChange={(o) => !o && setOpen(null)}
        onChanged={() => docs.refetch()}
      />
    </section>
  );
}
