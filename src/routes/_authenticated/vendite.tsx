import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { DashboardGrid } from "@/components/navigation/dashboard-grid";
import { companySells, useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/vendite")({
  head: () => ({ meta: [{ title: "Vendite — Trevi Fruit" }, { name: "description", content: "Funzioni operative per clienti, prodotti, preparazione e consegne." }, { property: "og:title", content: "Vendite — Trevi Fruit" }, { property: "og:description", content: "Funzioni operative per clienti, prodotti, preparazione e consegne." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Vendite,
});
function Vendite() { const { data: identity, isLoading } = useIdentity(); if (!isLoading && !companySells(identity)) return <AppShell title="Vendite"><p className="text-sm text-muted-foreground">Il profilo di vendita non è attivo per la tua azienda.</p></AppShell>; return <AppShell title="Vendite" description="Scegli la funzione con cui vuoi lavorare."><DashboardGrid dashboard="vendite" /></AppShell>; }