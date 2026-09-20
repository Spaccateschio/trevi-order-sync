import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { DashboardGrid } from "@/components/navigation/dashboard-grid";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Panoramica — Trevi Fruit" }, { name: "description", content: "Accesso alle aree operative e alle impostazioni di Trevi Fruit." }, { property: "og:title", content: "Panoramica — Trevi Fruit" }, { property: "og:description", content: "Accesso alle aree operative e alle impostazioni di Trevi Fruit." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Dashboard,
});

function Dashboard() { return <AppShell title="Panoramica" description="Scegli l’area in cui vuoi lavorare."><DashboardGrid dashboard="main" /></AppShell>; }