import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  Users,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/piattaforma", label: "Pannello", icon: LayoutDashboard, exact: true },
  { to: "/piattaforma/aziende", label: "Aziende", icon: Building2, exact: false },
  { to: "/piattaforma/utenti", label: "Utenti", icon: Users, exact: false },
  { to: "/piattaforma/registro", label: "Registro", icon: ClipboardList, exact: false },
  { to: "/piattaforma/assistenza", label: "Assistenza", icon: LifeBuoy, exact: false },
  { to: "/piattaforma/team", label: "Team interno", icon: UsersRound, exact: false },
  { to: "/piattaforma/impostazioni", label: "Impostazioni", icon: Settings, exact: false },
] as const;

export function PlatformShell({ children }: { children?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold">
              Amministrazione piattaforma
            </p>
            <p className="text-xs opacity-80">Trevi Fruit — area riservata</p>
          </div>
          <Badge variant="secondary" className="shrink-0">
            MOCKUP — dati di esempio
          </Badge>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2">
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? pathname === item.to
              : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-primary-foreground/80 hover:bg-primary-foreground/10",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children ?? <Outlet />}</main>
    </div>
  );
}
