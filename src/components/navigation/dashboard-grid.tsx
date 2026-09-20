import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { activeCompany, useIdentity } from "@/hooks/use-identity";
import { orderedKeys, useNavigationPreferences } from "@/hooks/use-navigation-preferences";
import { authorizedNavItems, type NavGroupKey } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function DashboardGrid({ dashboard }: { dashboard: "main" | NavGroupKey }) {
  const { data: identity } = useIdentity();
  const company = activeCompany(identity);
  const { preferences } = useNavigationPreferences(identity?.userId, company?.companyId);
  const candidates = authorizedNavItems(identity).filter((item) => item.dashboard === dashboard);
  const byKey = new Map(candidates.map((item) => [item.key, item]));
  const items = orderedKeys(candidates.map((item) => item.key), preferences.dashboard)
    .filter((key) => !preferences.dashboard.hidden.includes(key) || byKey.get(key)?.alwaysVisible)
    .flatMap((key) => byKey.get(key) ?? []);

  return (
    <div className="grid gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
      {items.map((item) => {
        const content = (
          <>
            {/* Smartphone: compatta, icona | titolo | freccia in riga, descrizione sotto */}
            <div className="flex flex-col gap-1 sm:hidden">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary"><item.icon className="h-4 w-4" /></span>
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">{item.label}</h2>
                {item.to ? <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
              </div>
              <p className="min-w-0 truncate text-xs leading-snug text-muted-foreground">{item.description}</p>
            </div>
            {/* Desktop/tablet: invariato */}
            <div className="hidden items-start justify-between gap-3 sm:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-primary"><item.icon className="h-5 w-5" /></span>
              {item.to ? <ArrowRight className="h-4 w-4 text-muted-foreground" /> : null}
            </div>
            <div className="hidden sm:block">
              <h2 className="font-display text-base font-semibold">{item.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            </div>
          </>
        );
        if (!item.to) return <section key={item.key} className="flex flex-col justify-between rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 opacity-75 sm:min-h-36 sm:p-4">{content}</section>;
        const className = cn("flex flex-col justify-between rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-colors", "hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-36 sm:p-4");
        return item.search ? <Link key={item.key} to={item.to} search={item.search} className={className}>{content}</Link> : <Link key={item.key} to={item.to} className={className}>{content}</Link>;
      })}
    </div>
  );
}
