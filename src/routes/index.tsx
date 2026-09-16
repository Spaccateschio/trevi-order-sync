import { Link, createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, Truck, Users } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Trevi Fruit — Ordini, preparazione e consegne" },
      {
        name: "description",
        content:
          "Portale Trevi Fruit per clienti e operatori: raccolta ordini, preparazione e consegne in un unico sistema.",
      },
      { property: "og:title", content: "Trevi Fruit — Ordini, preparazione e consegne" },
      {
        property: "og:description",
        content:
          "Portale Trevi Fruit per clienti e operatori: raccolta ordini, preparazione e consegne in un unico sistema.",
      },
    ],
  }),
  component: Home,
});

const PILLARS = [
  {
    icon: Users,
    title: "Clienti e accessi",
    text: "Ogni attività ha la propria anagrafica e le proprie persone autorizzate.",
  },
  {
    icon: ClipboardCheck,
    title: "Ordini e preparazione",
    text: "Il lavoro di magazzino resta separato da ciò che il cliente ha ordinato.",
  },
  {
    icon: Truck,
    title: "Consegne",
    text: "Stato del lavoro sempre aggiornato, dal ricevuto al consegnato.",
  },
];

function Home() {
  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <BrandMark tone="dark" />
        <Button asChild variant="secondary" size="sm">
          <Link to="/auth">Accedi</Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <section className="pt-8 sm:pt-16">
          <p className="font-display text-sm font-semibold uppercase tracking-widest text-sidebar-primary">
            Fondazione
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-5xl">
            Il sistema operativo di Trevi Fruit per ordini, preparazione e consegne.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-sidebar-foreground/75 sm:text-lg">
            I clienti ordinano dal telefono, il magazzino prepara e le consegne restano tracciate.
            La parte amministrativa resta nel gestionale aziendale.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/auth">Accedi al portale</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link
                to="/auth"
                search={{ modo: "registrazione" }}
                className="border-sidebar-border text-sidebar-foreground"
              >
                Registra la tua attività
              </Link>
            </Button>
          </div>
        </section>

        <section className="mt-14 grid gap-4 sm:grid-cols-3">
          {PILLARS.map((pillar) => (
            <article
              key={pillar.title}
              className="rounded-xl border border-sidebar-border bg-sidebar-accent p-5"
            >
              <pillar.icon className="h-6 w-6 text-sidebar-primary" aria-hidden="true" />
              <h2 className="mt-3 font-display text-lg font-semibold text-sidebar-accent-foreground">
                {pillar.title}
              </h2>
              <p className="mt-1.5 text-sm text-sidebar-foreground/75">{pillar.text}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
