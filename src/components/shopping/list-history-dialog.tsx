import { Link } from "@tanstack/react-router";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useShoppingListHistory } from "./use-shopping-list-history";

/** Storico delle Liste chiuse: solo lettura, dati dalla fotografia salvata alla chiusura. */
export function ListHistoryDialog({ companyId, open, onOpenChange }: { companyId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const query = useShoppingListHistory(companyId, open, true);

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
