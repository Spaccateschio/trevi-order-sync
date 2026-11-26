import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShoppingBag } from "lucide-react";
import { useState } from "react";

import { DirectPurchaseDraftDialog, STATUS_LABEL } from "@/components/purchase/direct-purchase-draft-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
export type DirectPurchaseRow = {
  id: string; number: string; status: string; created_at: string; purchase_date: string | null;
  buyer_label: string | null; shopping_list_id: string | null; direct_purchase_items: { id: string }[];
};
export type OpenDirectPurchase = { id: string; listId: string | null; status: string };

export function useDirectPurchases(companyId: string) {
  return useQuery({
    queryKey: ["direct-purchases-list", "company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_purchases")
        .select("id, number, status, created_at, purchase_date, buyer_label, shopping_list_id, direct_purchase_items(id)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as DirectPurchaseRow[];
    },
  });
}

/** Opens the existing AD window, reading current list quotas for drafts first. */
export function DirectPurchaseOpener({ companyId, open, onClose, onChanged }: { companyId: string; open: OpenDirectPurchase | null; onClose: () => void; onChanged: () => void }) {
  const readPreview = useServerFn(getGenerationPreview);
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

  return <>
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
        onOpenChange={(o) => !o && onClose()}
        onChanged={onChanged}
      />
  </>;
}

const dpDate = (d: string) => new Date(d).toLocaleDateString("it-IT");

/** Card AD nello stile delle card ordine: numero, stato, data, chi acquista, prodotti e pulsante Apri. */
export function DirectPurchaseCard({ row, onOpen }: { row: DirectPurchaseRow; onOpen: () => void }) {
  const n = row.direct_purchase_items.length;
  return (
    <article className="min-w-0 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold"><ShoppingBag className="size-4 shrink-0" />{row.number}</p>
        <Badge variant={row.status === "bozza" ? "default" : "secondary"}>{STATUS_LABEL[row.status] ?? row.status}</Badge>
      </div>
      <p className="mt-2 text-sm font-medium">Acquisto diretto del {dpDate(row.purchase_date ?? row.created_at)}</p>
      <p className="text-sm text-muted-foreground">{row.buyer_label || "Chi acquista non indicato"}</p>
      <p className="my-3 text-sm">{n} {n === 1 ? "prodotto" : "prodotti"}</p>
      <Button size="sm" className="font-semibold" onClick={onOpen}>Apri</Button>
    </article>
  );
}

/** Vecchia sezione separata: non più montata nella pagina Ordini fornitore. */
export function DirectPurchasesSection({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState<OpenDirectPurchase | null>(null);
  const docs = useDirectPurchases(companyId);
  const rows = docs.data ?? [];
  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <ShoppingBag className="size-5" /> Acquisti diretti
      </h2>
      {GROUPS.map((g) => (
        <div key={g.key} className="grid gap-2 md:grid-cols-2">
          {rows.filter((r) => r.status === g.key).map((r) => (
            <DirectPurchaseCard key={r.id} row={r} onOpen={() => setOpen({ id: r.id, listId: r.shopping_list_id, status: r.status })} />
          ))}
        </div>
      ))}
      <DirectPurchaseOpener companyId={companyId} open={open} onClose={() => setOpen(null)} onChanged={() => docs.refetch()} />
    </section>
  );
}
