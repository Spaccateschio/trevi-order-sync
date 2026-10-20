import { CalendarDays, Clock, LayoutGrid, MoreHorizontal, MoreVertical, Rows3, Search, Star } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ACTIONS = ["Bozze", "Storico liste", "Nuova lista", "Annulla lista"];
const FILTERS = ["Da acquistare", "Assegnati", "Da sistemare", "Da inserire", "Non acquistare"];

/** Anteprima isolata della parte alta della Lista: tasti finti, nessun salvataggio. */
export function ListHeaderMockup({ query, onQuery }: { query: string; onQuery: (v: string) => void }) {
  const [fav, setFav] = useState(true);
  const [view, setView] = useState<"card" | "righe">("card");
  const [active, setActive] = useState<string[]>([]);
  return (
    <>
      <div className="space-y-2">
        {/* 1. Da inventario + data, ⋯ per viste */}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              Da inventario 14/10 <Badge className="ml-1 h-4 px-1 text-[9px]">Aperta</Badge>
            </p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />Serve <span className="font-semibold text-foreground">Lun 19/10</span>
              <span>· 22 contati · 1 non acquistare</span>
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" aria-label="Viste">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Vista prodotti</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={view === "card"} onCheckedChange={() => setView("card")}>
                <LayoutGrid className="mr-2 h-4 w-4" />Card
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={view === "righe"} onCheckedChange={() => setView("righe")}>
                <Rows3 className="mr-2 h-4 w-4" />Righe
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem><CalendarDays className="mr-2 h-4 w-4" />Cambia «Per quando serve»</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 2. Azioni scorrevoli */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {ACTIONS.map((a) => (
            <Button key={a} size="sm" variant="outline" className={cn("h-7 shrink-0 text-xs", a === "Annulla lista" && "text-destructive")}>
              {a}
            </Button>
          ))}
        </div>
      </div>

      {/* 3. Ricerca + Preferiti/Tutti + ⋯ filtri gialli, fissi in alto */}
      <div className="sticky top-0 z-10 space-y-1.5 bg-background py-2">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Cerca prodotto" value={query} onChange={(e) => onQuery(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <div className="grid flex-1 grid-cols-2 gap-1 rounded-md bg-muted p-1">
            <Button size="sm" variant={fav ? "default" : "ghost"} className="h-7" onClick={() => setFav(true)}>
              <Star className="mr-1 h-3.5 w-3.5" />Preferiti
            </Button>
            <Button size="sm" variant={!fav ? "default" : "ghost"} className="h-7" onClick={() => setFav(false)}>Tutti</Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" className="relative h-9 w-9 shrink-0 bg-accent text-accent-foreground hover:bg-accent/90" aria-label="Filtri">
                <MoreHorizontal className="h-5 w-5" />
                {active.length ? (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">{active.length}</span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filtri</DropdownMenuLabel>
              {FILTERS.map((f) => (
                <DropdownMenuCheckboxItem
                  key={f}
                  checked={active.includes(f)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(c) => setActive((p) => (c ? [...p, f] : p.filter((x) => x !== f)))}
                >
                  {f}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem>Per fornitore…</DropdownMenuItem>
              <DropdownMenuItem>Per reparto…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
}

/** Barra fissa in basso: «Genera ordini» apre la scelta di data e orario. */
export function GenerateBarMockup() {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState("06:00");
  return (
    <>
      <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-background/95 p-2 md:bottom-0">
        <div className="mx-auto flex max-w-md items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">3 assegnati · 1 da sistemare</p>
          <Button className="shrink-0" onClick={() => setOpen(true)}>Genera ordini</Button>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Genera ordini</DialogTitle>
            <DialogDescription>Prova: nessun ordine viene creato.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Per quando serve: <b>Lun 19/10</b></p>
            <div>
              <p className="mb-1 flex items-center gap-2"><Clock className="h-4 w-4" />Orario di preparazione</p>
              <div className="grid grid-cols-3 gap-1">
                {["05:00", "06:00", "07:00"].map((s) => (
                  <Button key={s} size="sm" variant={slot === s ? "default" : "outline"} onClick={() => setSlot(s)}>{s}</Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Continua al riepilogo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
