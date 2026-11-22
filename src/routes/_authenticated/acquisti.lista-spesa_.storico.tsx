import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { matchesShoppingHistoryFilter, shoppingListOrderSummary, type ShoppingHistoryFilter } from "@/components/shopping/shopping-list-status";
import { useShoppingListHistory } from "@/components/shopping/use-shopping-list-history";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { activeCompany, companyBuys, useIdentity } from "@/hooks/use-identity";
import { LIST_STATUS_LABEL } from "@/lib/shopping-list";

export const Route = createFileRoute("/_authenticated/acquisti/lista-spesa_/storico")({
  head: () => ({
    meta: [
      { title: "Tutte le liste — Trevi Fruit" },
      { name: "description", content: "Storico delle Liste della Spesa in lavorazione, inviate, chiuse e annullate." },
      { property: "og:title", content: "Tutte le liste — Trevi Fruit" },
      { property: "og:description", content: "Consulta e riapri le Liste della Spesa senza modificare gli ordini salvati." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShoppingListHistoryPage,
});

const filters: { value: ShoppingHistoryFilter; label: string }[] = [
  { value: "tutte", label: "Tutte" },
  { value: "lavorazione", label: "In lavorazione" },
  { value: "inviate", label: "Inviate" },
  { value: "chiuse", label: "Chiuse" },
  { value: "annullate", label: "Annullate" },
];

function ShoppingListHistoryPage() {
  const { data: identity, isLoading } = useIdentity();
  const company = activeCompany(identity);
  const [filter, setFilter] = useState<ShoppingHistoryFilter>("tutte");
  const query = useShoppingListHistory(company?.companyId ?? "", Boolean(company));
  const rows = (query.data ?? []).filter((row) => matchesShoppingHistoryFilter(row, filter));

  if (!isLoading && !companyBuys(identity)) {
    return <AppShell title="Tutte le liste"><p className="text-sm text-muted-foreground">Il profilo di acquisto non è attivo per la tua azienda.</p></AppShell>;
  }

  return (
    <AppShell title="Tutte le liste" description="Le annullate sono visibili solo scegliendo il loro filtro." wide>
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm"><Link to="/acquisti/lista-spesa"><ArrowLeft aria-hidden="true" /> Torna alla Lista della Spesa</Link></Button>
        <Tabs value={filter} onValueChange={(value) => setFilter(value as ShoppingHistoryFilter)}>
          <TabsList className="h-auto max-w-full flex-wrap justify-start">
            {filters.map((item) => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        {query.isLoading || isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}
        {query.error ? <p className="text-sm text-destructive">{query.error.message}</p> : null}
        {!query.isLoading && !rows.length ? <p className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">Nessuna lista in questa vista.</p> : null}
        {rows.length ? <>
          <div className="space-y-2 md:hidden">{rows.map((row) => {
            const summary = shoppingListOrderSummary(row.purchase_orders);
            return <article key={row.id} className="space-y-2 rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {row.number ? <Link className="break-words font-semibold underline" to="/acquisti/lista-spesa/stampa/$listId" params={{ listId: row.id }} search={{ tipo: "completa" }}>{row.number}</Link> : <p className="break-words font-semibold">{row.name || "Lista senza numero"}</p>}
                  <p className="text-xs text-muted-foreground">{LIST_STATUS_LABEL[row.status]}</p>
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0"><Link to="/acquisti/lista-spesa" search={{ lista: row.id }}>Apri</Link></Button>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div><dt className="text-muted-foreground">Prodotti</dt><dd className="font-semibold">{row.shopping_list_items[0]?.count ?? 0}</dd></div>
                <div><dt className="text-muted-foreground">Ordini inviati</dt><dd className="font-semibold">{summary.sent}</dd></div>
                <div><dt className="text-muted-foreground">Visti dal fornitore</dt><dd className="font-semibold">{summary.seen}</dd></div>
                <div><dt className="text-muted-foreground">Per quando serve</dt><dd className="font-semibold">{row.delivery_date ? new Date(`${row.delivery_date}T00:00:00`).toLocaleDateString("it-IT") : "—"}</dd></div>
              </dl>
              <p className="text-xs text-muted-foreground">Confermata da: {row.who}</p>
            </article>;
          })}</div>
          <div className="hidden overflow-x-auto rounded-md border border-border md:block">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Lista</TableHead><TableHead>Stato</TableHead><TableHead className="text-right">Prodotti</TableHead>
              <TableHead className="text-right">Ordini inviati</TableHead><TableHead className="text-right">Visti</TableHead>
              <TableHead>Per quando serve</TableHead><TableHead>Confermata da</TableHead><TableHead className="text-right">Azione</TableHead>
            </TableRow></TableHeader>
            <TableBody>{rows.map((row) => {
              const summary = shoppingListOrderSummary(row.purchase_orders);
              return <TableRow key={row.id}>
                <TableCell>{row.number ? <Link className="font-semibold underline" to="/acquisti/lista-spesa/stampa/$listId" params={{ listId: row.id }} search={{ tipo: "completa" }}>{row.number}</Link> : <span className="font-semibold">{row.name || "Lista senza numero"}</span>}</TableCell>
                <TableCell>{LIST_STATUS_LABEL[row.status]}</TableCell>
                <TableCell className="text-right">{row.shopping_list_items[0]?.count ?? 0}</TableCell>
                <TableCell className="text-right">{summary.sent}</TableCell>
                <TableCell className="text-right">{summary.seen}</TableCell>
                <TableCell>{row.delivery_date ? new Date(`${row.delivery_date}T00:00:00`).toLocaleDateString("it-IT") : "—"}</TableCell>
                <TableCell>{row.who}</TableCell>
                <TableCell className="text-right"><Button asChild size="sm" variant="outline"><Link to="/acquisti/lista-spesa" search={{ lista: row.id }}>Apri</Link></Button></TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </div></> : null}
      </div>
    </AppShell>
  );
}
