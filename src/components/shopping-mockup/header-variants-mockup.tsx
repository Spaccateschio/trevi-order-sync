import { CalendarDays, Clock, LayoutGrid, MoreVertical, Rows3, Search, SlidersHorizontal, Star } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Variant = "A" | "B" | "C";
const ACTIONS = ["Genera ordini", "Bozze", "Storico liste", "Nuova lista", "Annulla lista"];

/** Anteprima isolata della parte alta della Lista: nessun dato reale, nessun salvataggio. */
export function HeaderVariantsMockup() {
  const [variant, setVariant] = useState<Variant>("A");
  return (
    <div className="mx-auto max-w-md space-y-3 pb-24">
      <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
        Anteprima con dati finti: i tasti non fanno nulla e la Lista reale non è toccata.
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
        {(["A", "B", "C"] as const).map((v) => (
          <Button key={v} size="sm" variant={variant === v ? "default" : "ghost"} onClick={() => setVariant(v)}>
            Variante {v}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {variant === "A" && "La tua proposta: ⋯ a destra, azioni in riga scorrevole, filtri gialli accanto a Preferiti/Tutti."}
        {variant === "B" && "Più minimale: tutte le azioni nel ⋯, resta visibile solo «Genera ordini»."}
        {variant === "C" && "Tutto in una barra fissa: data e stato in alto, ricerca e filtri sempre a portata di pollice."}
      </p>
      <div className="rounded-lg border bg-background p-2">
        {variant === "A" ? <VariantA /> : variant === "B" ? <VariantB /> : <VariantC />}
        <FakeCards />
      </div>
    </div>
  );
}

function ListMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" aria-label="Altre opzioni lista">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Vista prodotti</DropdownMenuLabel>
        <DropdownMenuItem><LayoutGrid className="mr-2 h-4 w-4" />Card</DropdownMenuItem>
        <DropdownMenuItem><Rows3 className="mr-2 h-4 w-4" />Righe</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem><CalendarDays className="mr-2 h-4 w-4" />Cambia «Per quando serve»</DropdownMenuItem>
        <DropdownMenuItem><Clock className="mr-2 h-4 w-4" />Orario di preparazione</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FiltersMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" className="h-9 w-9 shrink-0 bg-accent text-accent-foreground hover:bg-accent/90" aria-label="Filtri">
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Filtri</DropdownMenuLabel>
        {["Da acquistare", "Assegnati", "Da sistemare", "Da inserire", "Per fornitore…", "Per reparto…"].map((f) => (
          <DropdownMenuItem key={f}>{f}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Title() {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-bold">Da inventario 14/10 <Badge className="ml-1 h-4 px-1 text-[9px]">Aperta</Badge></p>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" />Serve <span className="font-semibold text-foreground">Lun 19/10</span>
      </p>
    </div>
  );
}

function Evaluation() {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/60 px-2 py-1.5 text-xs">
      <span className="min-w-0 truncate">22 contati · 0 da valutare · 1 non acquistare</span>
      <Button size="sm" className="h-7 shrink-0 bg-accent px-2 text-xs text-accent-foreground hover:bg-accent/90">Termina</Button>
    </div>
  );
}

function SearchRow() {
  return (
    <div className="relative">
      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input className="h-9 pl-8" placeholder="Cerca prodotto" />
    </div>
  );
}

function ScopeRow({ withFilters = true }: { withFilters?: boolean }) {
  const [fav, setFav] = useState(true);
  return (
    <div className="flex items-center gap-2">
      <div className="grid flex-1 grid-cols-2 gap-1 rounded-md bg-muted p-1">
        <Button size="sm" variant={fav ? "default" : "ghost"} className="h-7" onClick={() => setFav(true)}><Star className="mr-1 h-3.5 w-3.5" />Preferiti</Button>
        <Button size="sm" variant={!fav ? "default" : "ghost"} className="h-7" onClick={() => setFav(false)}>Tutti</Button>
      </div>
      {withFilters ? <FiltersMenu /> : null}
    </div>
  );
}

function VariantA() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2"><Title /><ListMenu /></div>
      <div className="-mx-2 flex gap-1.5 overflow-x-auto px-2 pb-1">
        {ACTIONS.map((a) => (
          <Button key={a} size="sm" variant={a === "Genera ordini" ? "default" : "outline"} className={cn("h-7 shrink-0 text-xs", a === "Annulla lista" && "text-destructive")}>{a}</Button>
        ))}
      </div>
      <Evaluation />
      <SearchRow />
      <ScopeRow />
    </div>
  );
}

function VariantB() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Title />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" aria-label="Menu lista"><MoreVertical className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ACTIONS.slice(1).map((a) => <DropdownMenuItem key={a} className={a === "Annulla lista" ? "text-destructive" : ""}>{a}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuItem>Vista Card / Righe</DropdownMenuItem>
            <DropdownMenuItem>Cambia data e orario</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Evaluation />
      <SearchRow />
      <ScopeRow />
    </div>
  );
}

function VariantC() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2"><Title /><ListMenu /></div>
      <div className="-mx-2 flex gap-1.5 overflow-x-auto px-2 pb-1">
        {ACTIONS.slice(1).map((a) => (
          <Button key={a} size="sm" variant="outline" className={cn("h-7 shrink-0 text-xs", a === "Annulla lista" && "text-destructive")}>{a}</Button>
        ))}
      </div>
      <Evaluation />
      <div className="sticky top-0 z-10 space-y-1.5 bg-background py-1">
        <div className="flex items-center gap-2"><div className="flex-1"><SearchRow /></div><FiltersMenu /></div>
        <ScopeRow withFilters={false} />
      </div>
    </div>
  );
}

function FakeCards() {
  return (
    <div className="mt-3 space-y-2">
      {["AGLIO SPAGNA", "CAROTE", "BASILICO"].map((n) => (
        <div key={n} className="rounded-md border bg-card p-2.5">
          <p className="text-sm font-bold">{n}</p>
          <p className="mt-1 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">Giacenza 2 kg · <span className="font-bold text-foreground">Da acquistare 2 kg</span></p>
        </div>
      ))}
    </div>
  );
}
