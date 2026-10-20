import { AlertTriangle, Check, MoreVertical, Pencil, Star, X } from "lucide-react";
import { useRef, useState } from "react";

import basilico from "@/assets/inventory-mock/basilico.jpg";
import carote from "@/assets/inventory-mock/carote.jpg";
import frutta from "@/assets/inventory-mock/frutta.jpg";
import patate from "@/assets/inventory-mock/patate-cipolle.jpg";
import pomodori from "@/assets/inventory-mock/pomodori.jpg";
import verdura from "@/assets/inventory-mock/verdura.jpg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { createDemoCards, showSuggested, supplierSummary, toggleOpen, type DemoCard } from "./compact-card-demo-data";
import { GenerateBarMockup, ListHeaderMockup } from "./list-header-mockup";

const IMAGES = { basilico, carote, frutta, "patate-cipolle": patate, pomodori, verdura };
const STATUS = {
  assegnato: { label: "Assegnato", cls: "bg-success/15 text-success" },
  da_inserire: { label: "Da inserire", cls: "bg-warning/20 text-warning-foreground" },
  da_sistemare: { label: "Da sistemare", cls: "bg-destructive/15 text-destructive" },
} as const;

/** Anteprima isolata: stato solo in memoria, nessuna scrittura. */
export function CompactCardMockup() {
  const [cards, setCards] = useState<DemoCard[]>(createDemoCards);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const shown = cards.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  const update = (id: string, patch: Partial<DemoCard>) => setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <div className="mx-auto max-w-md space-y-2 pb-40">
      <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
        Anteprima di prova con prodotti finti: nulla viene salvato e la Lista reale non è toccata.
      </div>
      <ListHeaderMockup query={query} onQuery={setQuery} />
      <GenerateBarMockup />
      {shown.map((card) => (
        <CompactCard
          key={card.id}
          card={card}
          open={openId === card.id}
          onToggle={() => setOpenId((cur) => toggleOpen(cur, card.id))}
          onConfirm={(quantity, unit) => {
            update(card.id, { quantity, unit, status: card.warning ? "da_sistemare" : "assegnato" });
            setOpenId(null);
          }}
          onFavorite={() => update(card.id, { favorite: !card.favorite })}
        />
      ))}
    </div>
  );
}

function CompactCard({ card, open, onToggle, onConfirm, onFavorite }: {
  card: DemoCard;
  open: boolean;
  onToggle: () => void;
  onConfirm: (quantity: number | null, unit: string) => void;
  onFavorite: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(card.quantity?.toString() ?? "");
  const [unit, setUnit] = useState(card.unit);
  const status = STATUS[card.status];

  const openCard = () => {
    setDraft(card.quantity?.toString() ?? "");
    setUnit(card.unit);
    onToggle();
    // Porta la card in alto, così resta sopra la tastiera.
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  return (
    <div ref={ref} className={cn("scroll-mt-16 rounded-lg border bg-card p-2.5 shadow-sm", open ? "border-primary" : "border-border")}>
      <div className="flex min-w-0 items-center gap-2.5">
        <img src={IMAGES[card.image]} alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold leading-tight">{card.name}</p>
          <div className="mt-0.5 flex items-center gap-1">
            <Badge variant="outline" className="h-4 px-1 text-[9px] leading-none">In lista</Badge>
            <span className={cn("rounded px-1 py-px text-[9px] font-semibold uppercase leading-tight", status.cls)}>{status.label}</span>
          </div>
        </div>
        <button type="button" onClick={onFavorite} aria-label="Preferito" className="shrink-0 p-1">
          <Star className={cn("h-5 w-5", card.favorite ? "fill-primary text-primary" : "text-muted-foreground")} />
        </button>
      </div>

      {card.warning ? (
        <p className="mt-1.5 flex items-center gap-1.5 rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive" title={card.warning}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{card.warning}</span>
        </p>
      ) : null}

      {!open ? (
        <>
          <button type="button" onClick={openCard} className="mt-1.5 flex w-full items-center justify-between gap-2 rounded bg-muted px-2 py-1.5 text-left">
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              Giacenza {card.stock} {card.unit} ·{" "}
              <span className="text-base font-bold text-foreground">
                Da acquistare{card.quantity == null ? ": —" : ` ${card.quantity} ${card.unit}`}
              </span>
            </span>
            <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
          <p className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">Fornitore: <span className="font-medium text-foreground">{supplierSummary(card)}</span></span>
            {showSuggested(card) ? <span className="shrink-0">Suggerita {card.suggested} {card.unit}</span> : null}
          </p>
        </>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            Ult. conteggio {card.lastCount} · Giacenza {card.stock}{showSuggested(card) ? ` · Suggerita ${card.suggested}` : ""} {card.unit}
          </p>
          <div className="flex gap-2">
            <Input autoFocus inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} className="text-right text-lg" aria-label="Quantità da acquistare" />
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="rounded-md border border-input bg-background px-2 text-sm" aria-label="U.M.">
              {card.units.map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
          {/* Conferma subito sotto il campo: resta sopra la tastiera. */}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="icon" onClick={onToggle} aria-label="Annulla"><X className="h-4 w-4" /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" aria-label="Altre azioni"><MoreVertical className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Acquisto diretto</DropdownMenuItem>
                <DropdownMenuItem>Aggiungi fornitore</DropdownMenuItem>
                <DropdownMenuItem>Togli da questa Lista</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" className="flex-1" onClick={() => onConfirm(draft === "" ? null : Number(draft), unit)}>
              <Check className="mr-1 h-4 w-4" />Conferma
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 3, 5, 10].map((n) => (
              <Button key={n} type="button" size="sm" variant="outline" onClick={() => setDraft(String((Number(draft) || 0) + n))}>+{n}</Button>
            ))}
          </div>
          <div className="space-y-1 rounded bg-muted p-2 text-xs">
            {card.suppliers.map((s) => (
              <p key={s.name} className="flex justify-between"><span>{s.name}</span><span>{s.quantity} {card.unit}</span></p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
