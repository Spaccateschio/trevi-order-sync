import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

/** Storico delle Liste chiuse: solo lettura, dati dalla fotografia salvata alla chiusura. */
export function ListHistoryDialog({ companyId, open, onOpenChange }: { companyId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const query = useQuery({
    queryKey: ["shopping-list-history", companyId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_lists")
        .select("id, number, status, confirmed_at, confirmed_by, delivery_date, shopping_list_items(count), purchase_orders(id, supplier_record_id)")
        .eq("company_id", companyId)
        .not("number", "is", null)
        .order("confirmed_at", { ascending: false });
      if (error) throw new Error(error.message);
      const ids = [...new Set((data ?? []).map((r) => r.confirmed_by).filter(Boolean))] as string[];
      const { data: people } = ids.length
        ? await supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", ids)
        : { data: [] };
      const names = new Map((people ?? []).map((p) => [p.user_id, [p.first_name, p.last_name].filter(Boolean).join(" ")]));
      return (data ?? []).map((r) => ({ ...r, who: r.confirmed_by ? (names.get(r.confirmed_by) ?? "—") : "—" }));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Storico Liste</DialogTitle>
        </DialogHeader>
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : !query.data?.length ? (
          <p className="text-sm text-muted-foreground">Nessuna Lista chiusa.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numero</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Prodotti</TableHead>
                <TableHead className="text-right">Fornitori</TableHead>
                <TableHead className="text-right">Ordini</TableHead>
                <TableHead>Consegna</TableHead>
                <TableHead>Confermata da</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link className="font-semibold underline" to="/acquisti/lista-spesa/stampa/$listId" params={{ listId: r.id }} search={{ tipo: "completa" }}>
                      {r.number}
                    </Link>
                  </TableCell>
                  <TableCell>{r.confirmed_at ? new Date(r.confirmed_at).toLocaleDateString("it-IT") : "—"}</TableCell>
                  <TableCell>{r.status === "chiusa" ? "Chiusa" : r.status}</TableCell>
                  <TableCell className="text-right">{(r.shopping_list_items as unknown as { count: number }[])[0]?.count ?? 0}</TableCell>
                  <TableCell className="text-right">{new Set(r.purchase_orders.map((o) => o.supplier_record_id)).size}</TableCell>
                  <TableCell className="text-right">{r.purchase_orders.length}</TableCell>
                  <TableCell>{r.delivery_date ? new Date(`${r.delivery_date}T00:00:00`).toLocaleDateString("it-IT") : "—"}</TableCell>
                  <TableCell>{r.who}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
