import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  LogOut,
  Settings,
  Users,
  UsersRound,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getPlatformAccess, type PlatformSection } from "@/lib/platform.functions";
import { cn } from "@/lib/utils";
import { PlatformNotificationBellMockup } from "./platform-notification-bell-mockup";

const NAV_ITEMS: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact: boolean;
  section: PlatformSection | null;
}[] = [
  { to: "/piattaforma", label: "Pannello", icon: LayoutDashboard, exact: true, section: null },
  { to: "/piattaforma/aziende", label: "Aziende", icon: Building2, exact: false, section: "aziende" },
  { to: "/piattaforma/richieste-vendo", label: "Richieste Vendo", icon: ClipboardList, exact: false, section: "aziende" },
  { to: "/piattaforma/utenti", label: "Utenti", icon: Users, exact: false, section: "utenti" },
  { to: "/piattaforma/registro", label: "Registro", icon: ClipboardList, exact: false, section: "registro" },
  { to: "/piattaforma/assistenza", label: "Assistenza", icon: LifeBuoy, exact: false, section: "assistenza" },
  { to: "/piattaforma/team", label: "Team interno", icon: UsersRound, exact: false, section: null },
  { to: "/piattaforma/impostazioni", label: "Impostazioni", icon: Settings, exact: false, section: "impostazioni" },
];

export function PlatformShell({ children }: { children?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { data: access, isLoading, isError } = useQuery({
    queryKey: ["platform-access"],
    queryFn: () => getPlatformAccess(),
    retry: false,
  });

  useEffect(() => {
    if (isError || (!isLoading && access && !access.isAdmin)) {
      navigate({ to: "/piattaforma-accesso", replace: true });
    }
  }, [isError, isLoading, access, navigate]);

  if (isLoading || !access) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Caricamento" />
      </div>
    );
  }

  if (!access.isAdmin) return null;

  const visibleItems = NAV_ITEMS.filter(
    (item) => (item.to !== "/piattaforma/richieste-vendo" || access.isSuper) && (
      item.section === null ||
      item.to === "/piattaforma/team" ||
      access.permissions[item.section] !== "nessuno"),
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/piattaforma-accesso", replace: true });
  }

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
          {access.isSuper && (
            <Badge variant="secondary" className="shrink-0">
              Super amministratore
            </Badge>
          )}
          <PlatformNotificationBellMockup showSellRequests={access.isSuper} />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            aria-label="Esci dall'area riservata"
            className="shrink-0 text-primary-foreground hover:bg-primary-foreground/10"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2">
          {visibleItems.map((item) => {
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
