import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Loader2, ShoppingCart, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlatformStats, listPlatformEvents } from "@/lib/platform.functions";

export const Route = createFileRoute("/piattaforma/")({
  head: () => ({
    meta: [
      { title: "Pannello piattaforma — Trevi Fruit" },
      {
        name: "description",
        content: "Pannello principale dell'amministrazione piattaforma: numeri chiave ed eventi recenti.",
      },
      { property: "og:title", content: "Pannello piattaforma — Trevi Fruit" },
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
  const { data: stats, isLoading } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: () => getPlatformStats(),
  });
  const { data: events } = useQuery({
    queryKey: ["platform-events"],
    queryFn: () => listPlatformEvents(),
  });

  if (isLoading || !stats) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Caricamento" />
      </div>
    );
  }

  const cards = [
    {
      label: "Aziende registrate",
      value: stats.companies,
      sub: `${stats.activeCompanies} attive`,
      icon: Building2,
      to: "/piattaforma/aziende",
    },
    {
      label: "Utenti registrati",
      value: stats.users,
      sub: "tutte le aziende",
      icon: Users,
      to: "/piattaforma/utenti",
    },
    {
      label: "Ordini oggi",
      value: stats.ordersToday,
      sub: `${stats.ordersMonth} questo mese`,
      icon: ShoppingCart,
      to: "/piattaforma/registro",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((stat) => {
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
          {(events ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nessun evento registrato finora.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {(events ?? []).slice(0, 5).map((event) => (
                <li key={event.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{event.action}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {event.section}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleString("it-IT")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
