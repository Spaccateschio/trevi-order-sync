import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { qty } from "@/lib/inventory";

const searchSchema = z.object({ tipo: z.enum(["completa", "diretti"]).optional() });

export const Route = createFileRoute("/_authenticated/acquisti/lista-spesa_/stampa/$listId")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Lista della Spesa chiusa — Trevi Fruit" },
      { name: "description", content: "Fotografia storica di una Lista della Spesa chiusa: ordini fornitori e acquisti diretti." },
      { property: "og:title", content: "Lista della Spesa chiusa — Trevi Fruit" },
      { property: "og:description", content: "Ordini fornitori e acquisti diretti di una Lista chiusa, stampabili." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ListPrint,
});

const dateIt = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("it-IT") : "—");
const time = (t: string | null) => (t ? t.slice(0, 5) : "");
const slot = (a: string | null, b: string | null) => (a || b ? `${time(a) || "…"} – ${time(b) || "…"}` : "—");

function ListPrint() {
  const { listId } = Route.useParams();
  const { tipo = "completa" } = Route.useSearch();

  const query = useQuery({
    queryKey: ["shopping-list-print", listId],
    queryFn: async () => {
      const { data: list, error } = await supabase
        .from("shopping_lists")
        .select("id, number, status, created_at, confirmed_at, confirmed_by, delivery_date, delivery_time_from, delivery_time_to, delivery_address_text, general_notes")
        .eq("id", listId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!list) throw new Error("Lista non trovata");
      const [orders, direct, author] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("id, number, send_status, delivery_date, delivery_time_from, delivery_time_to, delivery_address_text, supplier_notes, supplier_records(legal_name), purchase_order_items(id, product_name, product_code, purchase_quantity, purchase_unit_code, ordered_quantity, unit_code)")
          .eq("shopping_list_id", listId)
          .order("number"),
        supabase
          .from("shopping_list_direct_purchases")
          .select("id, product_name, product_code, quantity, unit_code, origin, reason, notes")
          .eq("list_id", listId)
          .order("product_name"),
        list.confirmed_by
          ? supabase.from("profiles").select("first_name, last_name").eq("user_id", list.confirmed_by).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (orders.error) throw new Error(orders.error.message);
      if (direct.error) throw new Error(direct.error.message);
      const who = author.data ? [author.data.first_name, author.data.last_name].filter(Boolean).join(" ") : null;
      return { list, orders: orders.data ?? [], direct: direct.data ?? [], who };
    },
  });

  if (query.isLoading) return <p className="p-6 text-sm text-muted-foreground">Caricamento…</p>;
  if (query.error || !query.data) return <p className="p-6 text-sm text-destructive">{(query.error as Error)?.message ?? "Errore"}</p>;
  const { list, orders, direct, who } = query.data;
  const buy = direct.filter((d) => d.origin !== "da_verificare");
  const check = direct.filter((d) => d.origin === "da_verificare");

  return (
    <div className="mx-auto max-w-3xl space-y-6 bg-background p-6 text-foreground print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link to="/acquisti/lista-spesa">← Lista della Spesa</Link>
        </Button>
        <Button asChild variant={tipo === "completa" ? "default" : "outline"} size="sm">
          <Link to="/acquisti/lista-spesa/stampa/$listId" params={{ listId }} search={{ tipo: "completa" }}>Lista completa</Link>
        </Button>
        <Button asChild variant={tipo === "diretti" ? "default" : "outline"} size="sm">
          <Link to="/acquisti/lista-spesa/stampa/$listId" params={{ listId }} search={{ tipo: "diretti" }}>Acquisti diretti</Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer aria-hidden="true" /> Stampa / PDF
        </Button>
      </div>

      {tipo === "diretti" ? (
        <section className="space-y-4">
          <h1 className="text-2xl font-bold">ACQUISTI DIRETTI — {list.number ?? "Lista"}</h1>
          <p>Data: {dateIt(list.delivery_date)}</p>
          {buy.length ? (
            <ul className="space-y-4">
              {buy.map((d) => (
                <li key={d.id} className="break-inside-avoid border-b border-border pb-3">
                  <p className="text-lg font-semibold">
                    ☐ {d.product_name} — {qty(d.quantity)} {d.unit_code ?? ""}
                  </p>
                  {d.notes ? <p>Nota: {d.notes}</p> : null}
                  <p className="mt-2">Effettivo: ______________ &nbsp;&nbsp; Prezzo: ______________</p>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nessun acquisto diretto.</p>
          )}
          {check.length ? (
            <div>
              <h2 className="font-semibold">Da verificare</h2>
              {check.map((d) => (
                <p key={d.id}>☐ {d.product_name} — {d.reason}</p>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="space-y-5">
          <header>
            <h1 className="text-2xl font-bold">Lista {list.number ?? ""}</h1>
            <p className="text-sm">
              Creata: {new Date(list.created_at).toLocaleDateString("it-IT")} · Confermata:{" "}
              {list.confirmed_at ? new Date(list.confirmed_at).toLocaleString("it-IT") : "—"}
              {who ? ` · da ${who}` : ""} · Stato: {list.status === "chiusa" ? "CHIUSA" : list.status.toUpperCase()}
            </p>
            <p className="text-sm">
              Consegna: {dateIt(list.delivery_date)} · {slot(list.delivery_time_from, list.delivery_time_to)} ·{" "}
              {list.delivery_address_text ?? "—"}
            </p>
            {list.general_notes ? <p className="text-sm">Note: {list.general_notes}</p> : null}
          </header>

          <div>
            <h2 className="text-lg font-bold">Ordini fornitori</h2>
            {orders.length ? (
              orders.map((o) => (
                <div key={o.id} className="mt-3 break-inside-avoid rounded-md border border-border p-3">
                  <p className="font-semibold">
                    {(o.supplier_records as { legal_name: string } | null)?.legal_name ?? "Fornitore"} — {o.number}
                    <span className="ml-2 text-xs font-normal">
                      {o.send_status === "inviato" ? "INVIATO" : o.send_status === "errore_invio" ? "ERRORE INVIO" : "DA INVIARE"}
                    </span>
                  </p>
                  <p className="text-xs">
                    Consegna: {dateIt(o.delivery_date)} · {slot(o.delivery_time_from, o.delivery_time_to)} · {o.delivery_address_text ?? "—"}
                  </p>
                  {o.supplier_notes ? <p className="text-xs">Note: {o.supplier_notes}</p> : null}
                  <ul className="mt-1 text-sm">
                    {o.purchase_order_items.map((it) => (
                      <li key={it.id}>
                        {it.product_name ?? it.product_code ?? "Prodotto"} →{" "}
                        {it.purchase_quantity !== null
                          ? `${qty(it.purchase_quantity)} ${it.purchase_unit_code ?? ""}`
                          : `${qty(it.ordered_quantity)} ${it.unit_code ?? ""}`}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className="text-sm">Nessun ordine fornitore.</p>
            )}
          </div>

          <div>
            <h2 className="text-lg font-bold">Acquisti diretti</h2>
            {direct.length ? (
              <ul className="text-sm">
                {direct.map((d) => (
                  <li key={d.id}>
                    ☐ {d.product_name} —{" "}
                    {d.origin === "da_verificare" ? `da verificare (${d.reason ?? ""})` : `${qty(d.quantity)} ${d.unit_code ?? ""}`}
                    {d.origin === "residuo" ? " (residuo)" : ""}
                    {d.notes ? ` — ${d.notes}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">Nessun acquisto diretto.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
