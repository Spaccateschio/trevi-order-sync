import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { DashboardGrid } from "@/components/navigation/dashboard-grid";
export const Route = createFileRoute("/_authenticated/b2b")({ head: () => ({ meta: [{ title: "B2B — Trevi Fruit" }, { name: "description", content: "Collegamenti diretti tra clienti e fornitori." }, { property: "og:title", content: "B2B — Trevi Fruit" }, { property: "og:description", content: "Collegamenti diretti tra clienti e fornitori." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: B2B });
function B2B() { return <AppShell title="B2B" description="Gestisci i rapporti diretti con clienti e fornitori."><DashboardGrid dashboard="b2b" /></AppShell>; }