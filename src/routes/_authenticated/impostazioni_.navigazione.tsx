import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { activeCompany, useIdentity } from "@/hooks/use-identity";
import { orderedKeys, type NavigationPreferences, useNavigationPreferences } from "@/hooks/use-navigation-preferences";
import { authorizedNavItems, NAV_GROUPS, type ModuleKey, type NavItem } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/impostazioni_/navigazione")({
  head: () => ({ meta: [{ title: "Personalizzazione navigazione — Trevi Fruit" }, { name: "description", content: "Ordine e visibilità personali del menu e delle dashboard." }, { property: "og:title", content: "Personalizzazione navigazione — Trevi Fruit" }, { property: "og:description", content: "Ordine e visibilità personali del menu e delle dashboard." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: NavigationSettings,
});

function move(keys: ModuleKey[], key: ModuleKey, direction: -1 | 1) { const index = keys.indexOf(key); const target = index + direction; if (index < 0 || target < 0 || target >= keys.length) return keys; const current = keys[index]; const replacement = keys[target]; if (!current || !replacement) return keys; const next = [...keys]; next[index] = replacement; next[target] = current; return next; }

/** Unisce l'ordine di una sezione con quello già salvato per le altre sezioni, così nessun ordine viene perso. */
function mergeSectionOrder(previousOrder: ModuleKey[], sectionKeys: ModuleKey[], sectionOrder: ModuleKey[]) {
  const section = new Set(sectionKeys);
  return [...sectionOrder, ...previousOrder.filter((key) => !section.has(key))];
}

function PreferenceRows({ items, hidden, order, onChange }: { items: NavItem[]; hidden: ModuleKey[]; order: ModuleKey[]; onChange: (value: { hidden: ModuleKey[]; order: ModuleKey[] }) => void }) {
  const itemMap = new Map(items.map((item) => [item.key, item]));
  const keys = orderedKeys(items.map((item) => item.key), { hidden, order });
  return <div className="divide-y divide-border rounded-lg border border-border bg-card">{keys.map((key, index) => { const item = itemMap.get(key); if (!item) return null; const visible = !hidden.includes(key) || Boolean(item.alwaysVisible); return <div key={key} className="flex items-center gap-3 p-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary"><item.icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.label}</p><p className="truncate text-xs text-muted-foreground">{item.description}</p></div><div className="flex shrink-0 items-center gap-1"><Button variant="ghost" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => onChange({ hidden, order: move(keys, key, -1) })} aria-label={`Sposta su ${item.label}`}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8" disabled={index === keys.length - 1} onClick={() => onChange({ hidden, order: move(keys, key, 1) })} aria-label={`Sposta giù ${item.label}`}><ArrowDown className="h-4 w-4" /></Button><Switch checked={visible} disabled={Boolean(item.alwaysVisible)} onCheckedChange={(checked) => onChange({ order: keys, hidden: checked ? hidden.filter((value) => value !== key) : [...new Set([...hidden, key])] })} aria-label={`Mostra ${item.label}`} /></div></div>; })}</div>;
}

function NavigationSettings() {
  const { data: identity } = useIdentity();
  const company = activeCompany(identity);
  const { preferences, isLoading, save, reset } = useNavigationPreferences(identity?.userId, company?.companyId);
  const [draft, setDraft] = useState<NavigationPreferences>(preferences);
  useEffect(() => setDraft(preferences), [preferences]);
  const authorized = authorizedNavItems(identity);
  const menuItems = authorized.filter((item) => item.menu);
  const dashboardItems = authorized.filter((item) => item.dashboard !== null);
  async function persist(next: NavigationPreferences) { setDraft(next); try { await save.mutateAsync(next); toast.success("Preferenze salvate"); } catch (error) { toast.error(error instanceof Error ? error.message : "Impossibile salvare"); } }
  async function restore() { try { await reset.mutateAsync(); toast.success("Preferenze predefinite ripristinate"); } catch (error) { toast.error(error instanceof Error ? error.message : "Impossibile ripristinare"); } }
  return <AppShell title="Personalizzazione" description="Scegli ciò che vuoi vedere nel menu e nelle dashboard." actions={<AlertDialog><AlertDialogTrigger asChild><Button variant="outline"><RotateCcw className="h-4 w-4" />Ripristina predefiniti</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Ripristinare la navigazione?</AlertDialogTitle><AlertDialogDescription>Menu e dashboard torneranno all’ordine e alla visibilità predefiniti.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={restore}>Ripristina</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}>
    {isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : <Tabs defaultValue="menu"><TabsList><TabsTrigger value="menu">Menu laterale</TabsTrigger><TabsTrigger value="dashboard">Dashboard</TabsTrigger></TabsList><TabsContent value="menu" className="mt-4 space-y-5"><PreferenceRows items={menuItems} hidden={draft.sidebar.hidden} order={draft.sidebar.order} onChange={(sidebar) => persist({ ...draft, sidebar })} /></TabsContent><TabsContent value="dashboard" className="mt-4 space-y-6">{(["main", ...NAV_GROUPS.map((group) => group.key)] as const).map((dashboard) => { const items = dashboardItems.filter((item) => item.dashboard === dashboard); if (!items.length) return null; return <section key={dashboard}><h2 className="mb-2 text-sm font-semibold">{dashboard === "main" ? "Panoramica" : NAV_GROUPS.find((group) => group.key === dashboard)?.label}</h2><PreferenceRows items={items} hidden={draft.dashboard.hidden} order={draft.dashboard.order} onChange={(dashboardPreference) => persist({ ...draft, dashboard: { hidden: dashboardPreference.hidden, order: mergeSectionOrder(draft.dashboard.order, items.map((item) => item.key), dashboardPreference.order) } })} /></section>; })}</TabsContent></Tabs>}
  </AppShell>;
}