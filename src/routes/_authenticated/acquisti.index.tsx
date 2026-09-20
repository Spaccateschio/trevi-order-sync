import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { DashboardGrid } from "@/components/navigation/dashboard-grid";
import { companyBuys, useIdentity } from "@/hooks/use-identity";

export const Route = createFileRoute("/_authenticated/acquisti/")({
  head: () => ({ meta: [{ title: "Acquisti — Trevi Fruit" }, { name: "description", content: "Funzioni operative per acquisti, fornitori, inventario e ordini." }, { property: "og:title", content: "Acquisti — Trevi Fruit" }, { property: "og:description", content: "Funzioni operative per acquisti, fornitori, inventario e ordini." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Acquisti,
});
function Acquisti() { const { data: identity, isLoading } = useIdentity(); if (!isLoading && !companyBuys(identity)) return <AppShell title="Acquisti"><p className="text-sm text-muted-foreground">Il profilo di acquisto non è attivo per la tua azienda.</p></AppShell>; return <AppShell title="Acquisti" description="Scegli la funzione con cui vuoi lavorare."><DashboardGrid dashboard="acquisti" /></AppShell>; }