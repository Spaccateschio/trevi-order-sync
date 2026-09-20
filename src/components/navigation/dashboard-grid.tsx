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
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const content = <><div className="flex items-start justify-between gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-primary"><item.icon className="h-5 w-5" /></span>{item.to ? <ArrowRight className="h-4 w-4 text-muted-foreground" /> : null}</div><div><h2 className="font-display text-base font-semibold">{item.label}</h2><p className="mt-1 text-sm text-muted-foreground">{item.description}</p></div></>;
        if (!item.to) return <section key={item.key} className="flex min-h-36 flex-col justify-between rounded-lg border border-dashed border-border bg-muted/30 p-4 opacity-75">{content}</section>;
        const className = cn("flex min-h-36 flex-col justify-between rounded-lg border border-border bg-card p-4 shadow-sm transition-colors", "hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring");
        return item.search ? <Link key={item.key} to={item.to} search={item.search} className={className}>{content}</Link> : <Link key={item.key} to={item.to} className={className}>{content}</Link>;
      })}
    </div>
  );
}