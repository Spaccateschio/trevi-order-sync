import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  PlugZap,
  ShoppingBasket,
  Truck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { hasRole, isCustomer, useIdentity } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; short: string; icon: LucideIcon };

const ALL_ITEMS: Record<string, NavItem> = {
  dashboard: { to: "/dashboard", label: "Panoramica", short: "Home", icon: LayoutDashboard },
  amministrazione: {
    to: "/amministrazione",
    label: "Amministrazione",
    short: "Admin",
    icon: Building2,
  },
  danea: { to: "/danea", label: "Gestionale", short: "Danea", icon: PlugZap },
  operativo: { to: "/operativo", label: "Operativo", short: "Lavoro", icon: ClipboardList },
  consegne: { to: "/consegne", label: "Consegne", short: "Consegne", icon: Truck },
  cliente: { to: "/cliente", label: "Area cliente", short: "Cliente", icon: ShoppingBasket },
  account: { to: "/account", label: "Account", short: "Account", icon: UserRound },
};

export function AppShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { data: identity } = useIdentity();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items: NavItem[] = [ALL_ITEMS["dashboard"]!];
  if (hasRole(identity, "amministratore")) items.push(ALL_ITEMS["amministrazione"]!);
  if (hasRole(identity, "amministratore")) items.push(ALL_ITEMS["danea"]!);
  if (hasRole(identity, "amministratore") || hasRole(identity, "operatore")) {
    items.push(ALL_ITEMS["operativo"]!);
  }
  if (hasRole(identity, "amministratore") || hasRole(identity, "trasportatore")) {
    items.push(ALL_ITEMS["consegne"]!);
  }
  if (isCustomer(identity)) items.push(ALL_ITEMS["cliente"]!);
  items.push(ALL_ITEMS["account"]!);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigazione desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar px-3 py-5 lg:flex">
        <div className="px-2">
          <BrandMark tone="dark" />
        </div>
        <nav className="mt-7 flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border pt-3">
          <p className="truncate px-3 pb-2 text-xs text-sidebar-foreground/60">{identity?.email}</p>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Esci
          </button>
        </div>
      </aside>

      <div className="lg:pl-60">
        {/* Barra superiore mobile/tablet */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-sidebar px-4 py-3 lg:hidden">
          <BrandMark tone="dark" />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            aria-label="Esci"
            className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8">
          <div className="mb-5 lg:mb-7">
            <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
            {description ? (
              <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">{description}</p>
            ) : null}
          </div>
          {children}
        </main>
      </div>

      {/* Navigazione mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="flex items-stretch">
          {items.map((item) => {
            const active = pathname === item.to;
            return (
              <li key={item.to} className="min-w-0 flex-1">
                <Link
                  to={item.to}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium",
                    active ? "text-sidebar-primary" : "text-sidebar-foreground/70",
                  )}
                >
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                  <span className="w-full truncate text-center">{item.short}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function PlaceholderCard({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
