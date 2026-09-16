import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { companyBuys, companySells, hasCompany, useIdentity } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";
import { visibleNavItems, type NavArea, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const AREA_LABEL: Record<NavArea, string> = {
  comune: "Azienda",
  acquisti: "Acquisti",
  vendite: "Vendite",
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
  const { data: identity, isSuccess } = useIdentity();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Chi non ha ancora un'azienda passa dalla scelta del profilo di utilizzo.
  useEffect(() => {
    if (isSuccess && identity && !hasCompany(identity)) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [identity, isSuccess, navigate]);

  const items = visibleNavItems(identity);
  const buys = companyBuys(identity);
  const sells = companySells(identity);
  const bothAreas = buys && sells;

  const groups: { area: NavArea; items: NavItem[] }[] = (
    ["comune", "acquisti", "vendite"] as NavArea[]
  )
    .map((area) => ({ area, items: items.filter((item) => item.area === area) }))
    .filter((group) => group.items.length > 0);

  // Su telefono si mostra una sola area alla volta, così gli ordini fatti ai
  // fornitori non si mescolano con gli ordini ricevuti dai clienti.
  const currentArea: NavArea = pathname.startsWith("/acquisti")
    ? "acquisti"
    : ["/vendite", "/operativo", "/consegne", "/danea"].some((p) => pathname.startsWith(p))
      ? "vendite"
      : "comune";

  const mobileArea: NavArea = bothAreas
    ? currentArea === "comune"
      ? "acquisti"
      : currentArea
    : buys
      ? "acquisti"
      : sells
        ? "vendite"
        : "comune";

  const mobileItems = items.filter(
    (item) => item.area === "comune" || item.area === mobileArea,
  );

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigazione desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto bg-sidebar px-3 py-5 lg:flex">
        <div className="px-2">
          <BrandMark tone="dark" />
        </div>
        <nav className="mt-7 flex flex-1 flex-col gap-4">
          {groups.map((group) => (
            <div key={group.area}>
              {groups.length > 1 ? (
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50">
                  {AREA_LABEL[group.area]}
                </p>
              ) : null}
              <div className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const active = pathname === item.to;
                  return (
                    <Link
                      key={item.key}
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
              </div>
            </div>
          ))}
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
          <div className="flex items-center gap-1">
            {bothAreas ? (
              <Link
                to={mobileArea === "acquisti" ? "/vendite" : "/acquisti"}
                className="rounded-full bg-sidebar-accent px-3 py-1.5 text-xs font-semibold text-sidebar-accent-foreground"
              >
                {mobileArea === "acquisti" ? "Vai a Vendite" : "Vai ad Acquisti"}
              </Link>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              aria-label="Esci"
              className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl overflow-x-hidden px-3 pb-28 pt-4 sm:px-5 lg:pb-10 lg:pt-7">
          <div className="mb-4 min-w-0 lg:mb-6">
            <h1 className="text-xl font-semibold sm:text-2xl lg:text-3xl">{title}</h1>
            {description ? (
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{description}</p>
            ) : null}
          </div>
          {children}
        </main>
      </div>

      {/* Navigazione mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="flex items-stretch">
          {mobileItems.map((item) => {
            const active = pathname === item.to;
            return (
              <li key={item.key} className="min-w-0 flex-1">
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
