import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Building2, ShoppingCart, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MOCK_EVENTS, MOCK_STATS } from "@/lib/platform-mock-data";

export const Route = createFileRoute("/piattaforma/")({
  head: () => ({
    meta: [
      { title: "Pannello piattaforma — Trevi Fruit (mockup)" },
      {
        name: "description",
        content: "Pannello principale dell'amministrazione piattaforma: numeri chiave ed eventi recenti.",
      },
      { property: "og:title", content: "Pannello piattaforma — Trevi Fruit (mockup)" },
      {
        property: "og:description",
        content: "Pannello principale dell'amministrazione piattaforma: numeri chiave ed eventi recenti.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformDashboard,
});

function PlatformDashboard() {
  const stats = [
    {
      label: "Aziende registrate",
      value: MOCK_STATS.companies,
      sub: `${MOCK_STATS.activeCompanies} attive`,
      icon: Building2,
      to: "/piattaforma/aziende",
    },
    {
      label: "Utenti registrati",
      value: MOCK_STATS.users,
      sub: "tutte le aziende",
      icon: Users,
      to: "/piattaforma/utenti",
    },
    {
      label: "Ordini oggi",
      value: MOCK_STATS.ordersToday,
      sub: `${MOCK_STATS.ordersMonth} questo mese`,
      icon: ShoppingCart,
      to: "/piattaforma/registro",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} to={stat.to}>
              <Card className="h-full transition-colors hover:border-accent">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                </CardHeader>
                <CardContent>
                  <p className="font-display text-3xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.sub}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Eventi recenti</CardTitle>
          <Link
            to="/piattaforma/registro"
            className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Vedi tutto il registro
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {MOCK_EVENTS.slice(0, 5).map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{event.action}</p>
                  <p className="truncate text-sm text-muted-foreground">{event.detail}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.company} · {event.user}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">{event.at}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
