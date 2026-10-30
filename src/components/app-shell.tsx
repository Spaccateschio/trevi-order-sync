// ============= Full file contents =============

import { NotificationBell } from "@/components/notification-bell";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { activeCompany, hasCompany, selectActiveCompany, useIdentity } from "@/hooks/use-identity";
import { orderedKeys, useNavigationPreferences } from "@/hooks/use-navigation-preferences";
import { supabase } from "@/integrations/supabase/client";
import { companyInitials, loadSidebarCollapsed, saveSidebarCollapsed, sidebarMainClass, sidebarRailClass, sidebarToggleLabel } from "@/lib/sidebar-collapse";
import { authorizedNavItems, isPathAllowedForProfile, NAV_GROUPS, type NavGroupKey, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { GuideButton } from "@/components/guide/guide-button";
import { useMobileKeyboardFlag } from "@/hooks/use-visual-viewport-bottom";
import type { GuideKey } from "@/lib/guides/definitions";

function NavLink({ item, pathname, nested = false, collapsed = false }: { item: NavItem; pathname: string; nested?: boolean; collapsed?: boolean }) {
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  if (!item.to) return null;
  // Le sotto-viste usano il parametro "sezione": la voce senza parametro resta attiva solo sulla vista base.
  const params = new URLSearchParams(searchStr.startsWith("?") ? searchStr.slice(1) : searchStr);
  const active = pathname === item.to && (item.search
    ? Object.entries(item.search).every(([key, value]) => params.get(key) === value)
    : !params.get("sezione"));
  const className = cn("flex items-center gap-2.5 rounded-md text-sm font-medium transition-colors", collapsed ? "justify-center" : "px-3 py-2", collapsed ? (nested ? "h-8 w-8" : "h-10 w-10") : null, nested && !collapsed && "ml-4 py-1.5 text-xs", active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground");
  const content = <><item.icon className={cn("shrink-0", nested ? "h-3.5 w-3.5" : "h-4 w-4")} aria-hidden="true" />{collapsed ? null : <span className="truncate">{item.label}</span>}</>;
  const link = item.search
    ? <Link to={item.to} search={item.search} className={className} aria-label={collapsed ? item.label : undefined}>{content}</Link>
    : <Link to={item.to} className={className} aria-label={collapsed ? item.label : undefined}>{content}</Link>;
  if (!collapsed) return link;
  // Con la barra compressa il nome compare al passaggio del mouse o con la tastiera.
  return <Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right" sideOffset={8}>{item.label}</TooltipContent></Tooltip>;
}

export function AppShell({ title, description, actions, compact = false, wide = false, guide, children }: { title: string; description?: string; actions?: ReactNode; compact?: boolean; wide?: boolean; guide?: GuideKey; children: ReactNode }) {
  const { data: identity, isSuccess } = useIdentity();
  useMobileKeyboardFlag();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isHome = pathname === "/dashboard" || pathname === "/";

  function handleBack() {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: "/dashboard" });
  }
  const company = activeCompany(identity);
  const { preferences } = useNavigationPreferences(identity?.userId, company?.companyId);
  const [openGroups, setOpenGroups] = useState<NavGroupKey[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  // La preferenza è locale al dispositivo: letta dopo l'apertura della pagina, così il rendering iniziale resta identico.
  useEffect(() => {
    setCollapsed(loadSidebarCollapsed());
  }, []);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    saveSidebarCollapsed(next);
  }

  useEffect(() => {
    if (isSuccess && identity && !hasCompany(identity)) navigate({ to: "/onboarding", replace: true });
  }, [identity, isSuccess, navigate]);

  // Pagine non pertinenti al profilo aziendale: anche aperte dall'indirizzo si torna alla Panoramica.
  const blocked = Boolean(isSuccess && company && !isPathAllowedForProfile(pathname, company.capabilities));
  useEffect(() => {
    if (blocked) navigate({ to: "/dashboard", replace: true });
  }, [blocked, navigate]);

  const authorized = authorizedNavItems(identity);
  const byKey = new Map(authorized.map((item) => [item.key, item]));
  const ordered = orderedKeys(authorized.map((item) => item.key), preferences.sidebar).flatMap((key) => byKey.get(key) ?? []);
  const menuItems = ordered.filter((item) => item.menu && (!preferences.sidebar.hidden.includes(item.key) || item.alwaysVisible));
  const home = menuItems.find((item) => item.key === "panoramica");
  const groups = NAV_GROUPS.map((group) => ({ ...group, parent: menuItems.find((item) => item.key === group.key), children: menuItems.filter((item) => item.group === group.key && item.key !== group.key) })).filter((group) => group.parent);
  const mobileItems = [home, ...groups.map((group) => group.parent)].filter((item): item is NavItem => Boolean(item)).slice(0, 5);

  useEffect(() => {
    const current = groups.find((group) => group.parent?.to && (pathname === group.parent.to || group.children.some((item) => item.to && pathname.startsWith(item.to))));
    if (current && !openGroups.includes(current.key)) setOpenGroups((value) => [...value, current.key]);
  }, [pathname]);

  async function handleCompanyChange(companyId: string) {
    if (!identity) return;
    selectActiveCompany(identity.userId, companyId);
    await queryClient.cancelQueries();
    queryClient.clear();
    navigate({ to: "/dashboard" });
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return <div className="min-h-screen bg-background">
    <aside className={sidebarRailClass(collapsed)}>
      <TooltipProvider delayDuration={150}>
      <div className={cn("flex items-center gap-1", collapsed ? "flex-col" : "justify-between px-2")}>
        <BrandMark tone="dark" showName={!collapsed} />
        <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
          <NotificationBell companyId={company?.companyId} className="text-sidebar-foreground hover:bg-sidebar-accent" />
          <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label={sidebarToggleLabel(collapsed)} aria-pressed={collapsed} className="text-sidebar-foreground hover:bg-sidebar-accent">
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {collapsed
        ? company ? <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" onClick={toggleSidebar} className="mt-4 h-10 w-10 shrink-0 border border-sidebar-border bg-sidebar-accent p-0 text-xs font-semibold text-sidebar-accent-foreground hover:bg-sidebar-accent">{companyInitials(company.companyName)}</Button></TooltipTrigger><TooltipContent side="right" sideOffset={8}>{company.companyName} — tocca per ingrandire la barra</TooltipContent></Tooltip> : null
        : identity && identity.memberships.length > 1 ? <div className="mt-5 px-2"><Select value={company?.companyId ?? ""} onValueChange={handleCompanyChange}><SelectTrigger className="border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground" aria-label="Azienda attiva"><SelectValue /></SelectTrigger><SelectContent>{identity.memberships.map((membership) => <SelectItem key={membership.companyId} value={membership.companyId}>{membership.companyName}</SelectItem>)}</SelectContent></Select></div> : company ? <p className="mt-5 truncate px-3 text-xs font-medium text-sidebar-foreground/60">{company.companyName}</p> : null}
        <nav className={cn("mt-4 flex flex-1 flex-col", collapsed ? "items-center gap-2" : "gap-4")}>
          {home ? <NavLink item={home} pathname={pathname} collapsed={collapsed} /> : null}
          {(["OPERATIVITÀ", "SISTEMA"] as const).map((section) => {
            const sectionGroups = groups.filter((group) => group.section === section);
            if (!sectionGroups.length) return null;
            return <div key={section}>{collapsed ? <div className="mb-1 h-px w-6 bg-sidebar-border" aria-hidden="true" /> : <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase text-sidebar-foreground/50">{section}</p>}<div className={cn(collapsed ? "flex flex-col items-center gap-1" : "space-y-1")}>{sectionGroups.map((group) => {
              if (collapsed) {
                // Con la barra compressa si vedono i gruppi; le sotto-voci compaiono per il gruppo in corso, come nella barra larga.
                return <div key={group.key} className="flex flex-col items-center gap-0.5"><NavLink item={group.parent as NavItem} pathname={pathname} collapsed />{openGroups.includes(group.key) ? <div className="flex flex-col items-center gap-0.5">{group.children.map((item) => <NavLink key={item.key} item={item} pathname={pathname} nested collapsed />)}</div> : null}</div>;
              }
              const isOpen = openGroups.includes(group.key);
              return <Collapsible key={group.key} open={isOpen} onOpenChange={(open) => setOpenGroups((value) => open ? [...new Set([...value, group.key])] : value.filter((key) => key !== group.key))}><div className="grid grid-cols-[minmax(0,1fr)_auto] items-center"><NavLink item={group.parent as NavItem} pathname={pathname} /><CollapsibleTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground" aria-label={`${isOpen ? "Chiudi" : "Apri"} ${group.label}`}><ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} /></Button></CollapsibleTrigger></div><CollapsibleContent className="mt-1 space-y-0.5">{group.children.map((item) => <NavLink key={item.key} item={item} pathname={pathname} nested />)}</CollapsibleContent></Collapsible>;
            })}</div></div>;
          })}
        </nav>
      <div className={cn("border-t border-sidebar-border pt-3", collapsed && "flex flex-col items-center")}>
        {collapsed ? null : <p className="truncate px-3 pb-2 text-xs text-sidebar-foreground/60">{identity?.email}</p>}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" onClick={handleSignOut} aria-label={collapsed ? "Esci" : undefined} className={cn("text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", collapsed ? "h-10 w-10 p-0" : "w-full justify-start")}>
              <LogOut className="h-4 w-4" />{collapsed ? null : "Esci"}
            </Button>
          </TooltipTrigger>
          {collapsed ? <TooltipContent side="right" sideOffset={8}>Esci</TooltipContent> : null}
        </Tooltip>
      </div>
      </TooltipProvider>
    </aside>
    <div className={sidebarMainClass(collapsed)}>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-sidebar px-4 py-3 lg:hidden"><BrandMark tone="dark" /><div className="flex items-center gap-2">{identity && identity.memberships.length > 1 ? <Select value={company?.companyId ?? ""} onValueChange={handleCompanyChange}><SelectTrigger className="h-8 max-w-40 border-sidebar-border bg-sidebar-accent text-xs text-sidebar-accent-foreground" aria-label="Azienda attiva"><SelectValue /></SelectTrigger><SelectContent>{identity.memberships.map((membership) => <SelectItem key={membership.companyId} value={membership.companyId}>{membership.companyName}</SelectItem>)}</SelectContent></Select> : null}<NotificationBell companyId={company?.companyId} className="text-sidebar-foreground hover:bg-sidebar-accent" /><Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Esci" className="text-sidebar-foreground hover:bg-sidebar-accent"><LogOut className="h-5 w-5" /></Button></div></header>
      <main className={cn("mx-auto w-full px-3 pb-28 pt-4 sm:px-5 lg:pb-10", wide ? "max-w-none lg:px-4" : "max-w-6xl", compact ? "lg:pt-3" : "lg:pt-7")}><div className={cn("min-w-0", compact ? "mb-2" : "mb-4 lg:mb-6")}><div className="flex flex-wrap items-start justify-between gap-2"><div className="flex min-w-0 items-start gap-1.5">{!isHome ? <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Torna alla pagina precedente" className="-ml-2 mt-0.5 h-8 w-8 shrink-0 text-muted-foreground"><ArrowLeft className="h-5 w-5" /></Button> : null}<div className="min-w-0" data-tour="pagina.titolo"><div className="flex items-center gap-1"><h1 className={cn("font-semibold", compact ? "text-xl" : "text-xl sm:text-2xl lg:text-3xl")}>{title}</h1>{guide ? <GuideButton guide={guide} /> : null}</div>{description ? <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{description}</p> : null}</div></div>{actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}</div></div>{blocked ? null : children}</main>
    </div>
    <nav data-hide-on-keyboard className="fixed inset-x-0 bottom-0 z-30 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden"><ul className="flex items-stretch">{mobileItems.map((item) => <li key={item.key} className="min-w-0 flex-1"><Link to={item.to ?? "/dashboard"} className={cn("flex h-16 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium", pathname === item.to ? "text-sidebar-primary" : "text-sidebar-foreground/70")}><item.icon className="h-5 w-5" /><span className="w-full truncate text-center">{item.short}</span></Link></li>)}</ul></nav>
  </div>;
}

export function PlaceholderCard({ title, items }: { title: string; items: string[] }) {
  return <section className="rounded-lg border border-border bg-card p-5 shadow-sm"><h2 className="font-display text-base font-semibold">{title}</h2><ul className="mt-3 space-y-2">{items.map((item) => <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{item}</li>)}</ul></section>;
}
