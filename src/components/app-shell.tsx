import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { activeCompany, hasCompany, selectActiveCompany, useIdentity } from "@/hooks/use-identity";
import { orderedKeys, useNavigationPreferences } from "@/hooks/use-navigation-preferences";
import { supabase } from "@/integrations/supabase/client";
import { authorizedNavItems, NAV_GROUPS, type NavGroupKey, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function NavLink({ item, pathname, nested = false }: { item: NavItem; pathname: string; nested?: boolean }) {
  if (!item.to) return null;
  const active = pathname === item.to && (!item.search || Object.entries(item.search).every(([key, value]) => new URLSearchParams(window.location.search).get(key) === value));
  const className = cn("flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors", nested && "ml-4 py-1.5 text-xs", active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground");
  const content = <><item.icon className={cn("shrink-0", nested ? "h-3.5 w-3.5" : "h-4 w-4")} aria-hidden="true" /><span className="truncate">{item.label}</span></>;
  return item.search ? <Link to={item.to} search={item.search} className={className}>{content}</Link> : <Link to={item.to} className={className}>{content}</Link>;
}

export function AppShell({ title, description, actions, compact = false, wide = false, children }: { title: string; description?: string; actions?: ReactNode; compact?: boolean; wide?: boolean; children: ReactNode }) {
  const { data: identity, isSuccess } = useIdentity();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const company = activeCompany(identity);
  const { preferences } = useNavigationPreferences(identity?.userId, company?.companyId);
  const [openGroups, setOpenGroups] = useState<NavGroupKey[]>([]);

  useEffect(() => {
    if (isSuccess && identity && !hasCompany(identity)) navigate({ to: "/onboarding", replace: true });
  }, [identity, isSuccess, navigate]);

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
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto bg-sidebar px-3 py-5 lg:flex">
      <div className="px-2"><BrandMark tone="dark" /></div>
      {identity && identity.memberships.length > 1 ? <div className="mt-5 px-2"><Select value={company?.companyId ?? ""} onValueChange={handleCompanyChange}><SelectTrigger className="border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground" aria-label="Azienda attiva"><SelectValue /></SelectTrigger><SelectContent>{identity.memberships.map((membership) => <SelectItem key={membership.companyId} value={membership.companyId}>{membership.companyName}</SelectItem>)}</SelectContent></Select></div> : company ? <p className="mt-5 truncate px-3 text-xs font-medium text-sidebar-foreground/60">{company.companyName}</p> : null}
      <nav className="mt-4 flex flex-1 flex-col gap-4">
        {home ? <NavLink item={home} pathname={pathname} /> : null}
        {(["OPERATIVITÀ", "SISTEMA"] as const).map((section) => {
          const sectionGroups = groups.filter((group) => group.section === section);
          if (!sectionGroups.length) return null;
          return <div key={section}><p className="px-3 pb-1.5 text-[11px] font-semibold uppercase text-sidebar-foreground/50">{section}</p><div className="space-y-1">{sectionGroups.map((group) => {
            const isOpen = openGroups.includes(group.key);
            return <Collapsible key={group.key} open={isOpen} onOpenChange={(open) => setOpenGroups((value) => open ? [...new Set([...value, group.key])] : value.filter((key) => key !== group.key))}><div className="grid grid-cols-[minmax(0,1fr)_auto] items-center"><NavLink item={group.parent as NavItem} pathname={pathname} /><CollapsibleTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground" aria-label={`${isOpen ? "Chiudi" : "Apri"} ${group.label}`}><ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} /></Button></CollapsibleTrigger></div><CollapsibleContent className="mt-1 space-y-0.5">{group.children.map((item) => <NavLink key={item.key} item={item} pathname={pathname} nested />)}</CollapsibleContent></Collapsible>;
          })}</div></div>;
        })}
      </nav>
      <div className="border-t border-sidebar-border pt-3"><p className="truncate px-3 pb-2 text-xs text-sidebar-foreground/60">{identity?.email}</p><Button variant="ghost" onClick={handleSignOut} className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><LogOut className="h-4 w-4" />Esci</Button></div>
    </aside>
    <div className="lg:pl-60">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-sidebar px-4 py-3 lg:hidden"><BrandMark tone="dark" /><div className="flex items-center gap-2">{identity && identity.memberships.length > 1 ? <Select value={company?.companyId ?? ""} onValueChange={handleCompanyChange}><SelectTrigger className="h-8 max-w-40 border-sidebar-border bg-sidebar-accent text-xs text-sidebar-accent-foreground" aria-label="Azienda attiva"><SelectValue /></SelectTrigger><SelectContent>{identity.memberships.map((membership) => <SelectItem key={membership.companyId} value={membership.companyId}>{membership.companyName}</SelectItem>)}</SelectContent></Select> : null}<Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Esci" className="text-sidebar-foreground hover:bg-sidebar-accent"><LogOut className="h-5 w-5" /></Button></div></header>
      <main className={cn("mx-auto w-full px-3 pb-28 pt-4 sm:px-5 lg:pb-10", wide ? "max-w-none lg:px-4" : "max-w-6xl", compact ? "lg:pt-3" : "lg:pt-7")}><div className={cn("min-w-0", compact ? "mb-2" : "mb-4 lg:mb-6")}><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h1 className={cn("font-semibold", compact ? "text-xl" : "text-xl sm:text-2xl lg:text-3xl")}>{title}</h1>{description ? <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{description}</p> : null}</div>{actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}</div></div>{children}</main>
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden"><ul className="flex items-stretch">{mobileItems.map((item) => <li key={item.key} className="min-w-0 flex-1"><Link to={item.to ?? "/dashboard"} className={cn("flex h-16 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium", pathname === item.to ? "text-sidebar-primary" : "text-sidebar-foreground/70")}><item.icon className="h-5 w-5" /><span className="w-full truncate text-center">{item.short}</span></Link></li>)}</ul></nav>
  </div>;
}

export function PlaceholderCard({ title, items }: { title: string; items: string[] }) {
  return <section className="rounded-lg border border-border bg-card p-5 shadow-sm"><h2 className="font-display text-base font-semibold">{title}</h2><ul className="mt-3 space-y-2">{items.map((item) => <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{item}</li>)}</ul></section>;
}