import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  Eye,
  Lightbulb,
  Loader2,
  MousePointerClick,
  RotateCcw,
  Smartphone,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPlatformAccess } from "@/lib/platform.functions";
import {
  formatPlatformUsageDay,
  getPlatformUsageAdvice,
  getPlatformUsageCommandLabel,
  getPlatformUsagePageLabel,
  PLATFORM_USAGE_PAGES,
  platformUsagePercentChange,
  type PlatformUsageAreaFilter,
  type PlatformUsageDeviceFilter,
  type PlatformUsageFilters,
  type PlatformUsagePeriod,
} from "@/lib/platform-usage";
import { getPlatformUsageSnapshot } from "@/lib/platform-usage.functions";

const trendConfig = {
  views: { label: "Pagine viste", color: "var(--chart-2)" },
  clicks: { label: "Clic", color: "var(--chart-1)" },
} satisfies ChartConfig;

const pageConfig = {
  views: { label: "Pagine viste", color: "var(--chart-2)" },
} satisfies ChartConfig;

const clickConfig = {
  clicks: { label: "Clic", color: "var(--chart-1)" },
} satisfies ChartConfig;

const DEFAULT_FILTERS: PlatformUsageFilters = {
  period: 30,
  area: "tutte",
  device: "tutti",
  page: "tutte",
};

function ChangeBadge({ value }: { value: number }) {
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon
        className={value >= 0 ? "h-3.5 w-3.5 text-success" : "h-3.5 w-3.5 text-destructive"}
        aria-hidden
      />
      {value > 0 ? "+" : ""}{value}% sul periodo precedente
    </span>
  );
}

export function PlatformUsagePanel() {
  const { data: access, isLoading: accessLoading } = useQuery({
    queryKey: ["platform-access"],
    queryFn: () => getPlatformAccess(),
    retry: false,
  });
  const [filters, setFilters] = useState<PlatformUsageFilters>(DEFAULT_FILTERS);
  const {
    data: snapshot,
    isLoading: snapshotLoading,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["platform-usage", filters],
    queryFn: () => getPlatformUsageSnapshot({ data: filters }),
    enabled: access?.isSuper === true,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const pages = useMemo(() => (snapshot?.pages ?? []).map((page) => ({
    ...page,
    label: getPlatformUsagePageLabel(page.key),
  })), [snapshot]);
  const clickedElements = useMemo(() => (snapshot?.clickedElements ?? []).map((element) => ({
    ...element,
    label: getPlatformUsageCommandLabel(element.key),
    page: getPlatformUsagePageLabel(element.pageKey),
  })), [snapshot]);
  const advice = useMemo(() => snapshot ? getPlatformUsageAdvice(snapshot) : [], [snapshot]);
  const daily = useMemo(() => (snapshot?.daily ?? []).map((row) => ({
    ...row,
    label: formatPlatformUsageDay(row.date),
  })), [snapshot]);

  const number = new Intl.NumberFormat("it-IT");
  const topPages = pages.slice(0, 6);
  const topElements = clickedElements.slice(0, 8);
  const topPage = pages[0];
  const smartphoneViews = pages.reduce((sum, page) => sum + page.smartphoneViews, 0);
  const smartphoneShare = snapshot?.totals.views
    ? Math.round((smartphoneViews / snapshot.totals.views) * 100)
    : 0;

  if (accessLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Caricamento" />
      </div>
    );
  }

  if (!access?.isSuper) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Statistiche riservate</CardTitle>
          <CardDescription>
            Questa sezione è disponibile solo per il super amministratore.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-semibold">Statistiche di utilizzo</h1>
            <Badge variant="secondary">Dati reali</Badge>
            {isFetching && !snapshotLoading && (
              <span className="text-xs text-muted-foreground">Aggiornamento…</span>
            )}
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Scopri dove si concentrano visite e clic e quali modifiche possono rendere l’app più semplice.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
          <RotateCcw aria-hidden />
          Azzera filtri
        </Button>
      </div>

      <div role="note" className="rounded-lg border border-accent/50 bg-accent/10 px-4 py-3 text-sm">
        <span className="font-medium">Raccolta anonima interna.</span>{" "}
        <span className="text-muted-foreground">
          {snapshot?.collectionStartedAt
            ? `Dati dal ${new Date(snapshot.collectionStartedAt).toLocaleDateString("it-IT")}. `
            : "La raccolta inizia con il primo utilizzo registrato. "}
          Nessun nome, azienda o contenuto operativo viene salvato. Lo storico precedente resta disponibile in Analytics.
        </span>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
            Filtra le statistiche
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Area</span>
            <Select
              value={filters.area}
              onValueChange={(value) => setFilters((current) => ({
                ...current,
                area: value as PlatformUsageAreaFilter,
                page: "tutte",
              }))}
            >
              <SelectTrigger className="w-full" aria-label="Filtra per area"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutte">Aziende e piattaforma</SelectItem>
                <SelectItem value="aziende">Solo aree aziendali</SelectItem>
                <SelectItem value="piattaforma">Solo area piattaforma</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Periodo</span>
            <Select
              value={String(filters.period)}
              onValueChange={(value) => setFilters((current) => ({
                ...current,
                period: Number(value) as PlatformUsagePeriod,
              }))}
            >
              <SelectTrigger className="w-full" aria-label="Filtra per periodo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Ultimi 7 giorni</SelectItem>
                <SelectItem value="30">Ultimi 30 giorni</SelectItem>
                <SelectItem value="90">Ultimi 90 giorni</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Dispositivo</span>
            <Select
              value={filters.device}
              onValueChange={(value) => setFilters((current) => ({
                ...current,
                device: value as PlatformUsageDeviceFilter,
              }))}
            >
              <SelectTrigger className="w-full" aria-label="Filtra per dispositivo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti i dispositivi</SelectItem>
                <SelectItem value="smartphone">Smartphone</SelectItem>
                <SelectItem value="computer">Computer</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Pagina</span>
            <Select
              value={filters.page}
              onValueChange={(value) => setFilters((current) => ({
                ...current,
                page: value as PlatformUsageFilters["page"],
              }))}
            >
              <SelectTrigger className="w-full" aria-label="Filtra per pagina"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutte">Tutte le pagine</SelectItem>
                {PLATFORM_USAGE_PAGES.filter((page) => filters.area === "tutte" || page.area === filters.area)
                  .map((page) => <SelectItem key={page.key} value={page.key}>{page.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        </CardContent>
      </Card>

      {isError ? (
        <Card>
          <CardHeader>
            <CardTitle>Statistiche non disponibili</CardTitle>
            <CardDescription>Riprova tra poco; nessun dato operativo è stato modificato.</CardDescription>
          </CardHeader>
        </Card>
      ) : snapshotLoading || !snapshot ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Caricamento statistiche" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pagine viste</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="font-display text-2xl font-bold">{number.format(snapshot.totals.views)}</p>
                <ChangeBadge value={platformUsagePercentChange(snapshot.totals.views, snapshot.previousTotals.views)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Clic totali</CardTitle>
                <MousePointerClick className="h-4 w-4 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="font-display text-2xl font-bold">{number.format(snapshot.totals.clicks)}</p>
                <ChangeBadge value={platformUsagePercentChange(snapshot.totals.clicks, snapshot.previousTotals.clicks)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pagina più aperta</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="truncate font-display text-lg font-bold">{topPage?.label ?? "Nessuna pagina"}</p>
                <p className="text-xs text-muted-foreground">{number.format(topPage?.views ?? 0)} aperture nel periodo</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Uso da smartphone</CardTitle>
                <Smartphone className="h-4 w-4 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="font-display text-2xl font-bold">{smartphoneShare}%</p>
                <p className="text-xs text-muted-foreground">delle pagine viste nel filtro attuale</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Andamento nel tempo</CardTitle>
              <CardDescription>Pagine viste e clic giornalieri reali nel periodo scelto.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={trendConfig} className="h-[280px] w-full aspect-none">
                <LineChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={32} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} width={56} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="views" stroke="var(--color-views)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="clicks" stroke="var(--color-clicks)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ChartContainer>
              <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-chart-2" /> Pagine viste</span>
                <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-chart-1" /> Clic</span>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pagine più visitate</CardTitle>
                <CardDescription>Confronta dove si concentra l’attività reale.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={pageConfig} className="h-[300px] w-full aspect-none">
                  <BarChart data={topPages} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={112} />
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Bar dataKey="views" fill="var(--color-views)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Elementi più cliccati</CardTitle>
                <CardDescription>I comandi misurati, con nomi leggibili.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={clickConfig} className="h-[300px] w-full aspect-none">
                  <BarChart data={topElements} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={120} />
                    <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(value, _name, item) => (
                      <div className="flex min-w-44 items-center justify-between gap-4">
                        <span className="text-muted-foreground">{item.payload.page}</span>
                        <span className="font-mono font-medium">{number.format(Number(value))} clic</span>
                      </div>
                    )} />} />
                    <Bar dataKey="clicks" fill="var(--color-clicks)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="h-4 w-4 text-accent" aria-hidden />
                Cosa migliorare nell’esperienza utente
              </CardTitle>
              <CardDescription>
                Suggerimenti pratici calcolati dai dati: sono ipotesi di miglioramento da verificare, non cause dimostrate.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {advice.map((item) => (
                <div key={item.id} className="rounded-lg bg-muted p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{item.title}</p>
                    {!item.sufficient && <Badge variant="outline">Dati insufficienti</Badge>}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{item.suggestion}</p>
                  <p className="mt-3 border-t border-border pt-2 text-xs font-medium text-foreground">{item.evidence}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
