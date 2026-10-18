import { useState } from "react";
import {
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Info,
  Mic,
  Pencil,
  Search,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { startPreparationGuide } from "@/lib/guides/preparation-guide";
import {
  canComplete,
  canConfirm,
  confirmLine,
  createDemoOrders,
  status,
  updateLine,
  type Line,
} from "./preparation-demo-data";
import pomodori from "@/assets/inventory-mock/pomodori.jpg";
import carote from "@/assets/inventory-mock/carote.jpg";
import basilico from "@/assets/inventory-mock/basilico.jpg";
const images = { pomodori, carote, basilico };
export function PreparationGuideButton() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Aiuto su questa pagina">
          <Info className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => void startPreparationGuide()}>
          Guida completa
        </DropdownMenuItem>
        <DropdownMenuItem>Chiudi</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function PreparationMockup() {
  const [orders, setOrders] = useState(createDemoOrders);
  const [selected, setSelected] = useState("DEMO-001");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Tutti");
  const [review, setReview] = useState(false);
  const [voice, setVoice] = useState(false);
  const [voiceLine, setVoiceLine] = useState("");
  const [voiceWeight, setVoiceWeight] = useState("11,8");
  const [proposed, setProposed] = useState(false);
  const order = orders.find((o) => o.id === selected);
  if (!order) return null;
  const patchLine = (id: string, patch: (l: Line) => Line) =>
    setOrders((all) =>
      all.map((o) =>
        o.id === order.id ? { ...o, lines: o.lines.map((l) => (l.id === id ? patch(l) : l)) } : o,
      ),
    );
  const verified = order.lines.filter((l) => l.confirmed || l.missing).length;
  const visible = orders.filter(
    (o) =>
      (filter === "Tutti" || status(o) === filter) &&
      `${o.id} ${o.customer}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedVoiceLine = order.lines.find((l) => l.id === voiceLine);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border py-3">
        <div className="flex items-center gap-2">
          <Badge className="bg-warning/15 text-warning-foreground" variant="outline">
            MOCKUP
          </Badge>
          <span className="text-xs text-muted-foreground">
            Dati inventati · nessun salvataggio reale
          </span>
        </div>
        <span className="text-sm font-medium">Consegne dimostrative · 19 ottobre</span>
      </div>
      <div className="grid grid-cols-3 gap-2 border-b border-border pb-4">
        {["Da preparare", "In lavorazione", "Pronti"].map((s) => (
          <div key={s} className="flex items-center gap-2 sm:gap-3">
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
                s === "Pronti" ? "bg-success/10 text-success" : "bg-muted text-primary",
              )}
            >
              {s === "Pronti" ? (
                <CheckCheck className="h-5 w-5" />
              ) : s === "In lavorazione" ? (
                <Clock3 className="h-5 w-5" />
              ) : (
                <UserRound className="h-5 w-5" />
              )}
            </span>
            <div>
              <p className="text-xl font-semibold">
                {orders.filter((o) => status(o) === s).length}
              </p>
              <p className="text-xs text-muted-foreground">{s}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <section data-tour="prep.elenco" className="min-w-0 space-y-3">
          <h2 className="font-semibold">
            Ordini <span className="ml-1 text-muted-foreground">{orders.length}</span>
          </h2>
          <div data-tour="prep.filtri" className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Cerca cliente o ordine"
                className="pl-9"
                placeholder="Cliente o numero ordine"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger aria-label="Stato ordini">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Tutti", "Da preparare", "In lavorazione", "Pronti"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {visible.map((o) => (
              <Button
                key={o.id}
                variant="outline"
                onClick={() => setSelected(o.id)}
                aria-pressed={selected === o.id}
                className={cn(
                  "h-auto min-h-32 w-full items-start justify-start whitespace-normal p-4 text-left",
                  selected === o.id && "border-primary bg-primary/5",
                  o.ready && "border-success/40 bg-success/5",
                )}
              >
                <div className="w-full min-w-0 space-y-2">
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span>{o.id}</span>
                    <span>{o.time}</span>
                  </div>
                  <p className="font-semibold">{o.customer}</p>
                  <div className="flex items-center justify-between gap-1">
                    <Badge
                      variant="outline"
                      className={o.ready ? "text-success" : "text-muted-foreground"}
                    >
                      {status(o)}
                    </Badge>
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {o.lines.filter((l) => l.confirmed || l.missing).length}/{o.lines.length}{" "}
                    articoli · {o.assignee || "Non assegnato"}
                  </p>
                </div>
              </Button>
            ))}
          </div>
          {!visible.length && (
            <p className="py-6 text-sm text-muted-foreground">Nessun ordine trovato.</p>
          )}
        </section>
        <section className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {order.id} · Consegna ore {order.time}
              </p>
              <h2 className="mt-1 text-xl font-semibold">{order.customer}</h2>
              {order.note && (
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">{order.note}</p>
              )}
            </div>
            <Badge variant="outline" className={order.ready ? "border-success text-success" : ""}>
              {status(order)}
            </Badge>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 py-4">
            <div data-tour="prep.preparatore" className="w-48 space-y-1.5">
              <Label>Preparatore</Label>
              <Select
                disabled={order.ready}
                value={order.assignee || "none"}
                onValueChange={(value) =>
                  setOrders((all) =>
                    all.map((o) =>
                      o.id === order.id ? { ...o, assignee: value === "none" ? "" : value } : o,
                    ),
                  )
                }
              >
                <SelectTrigger aria-label="Preparatore">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["none", "Luca", "Sara", "Marco"].map((v) => (
                    <SelectItem value={v} key={v}>
                      {v === "none" ? "Non assegnato" : v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              data-tour="prep.voce"
              variant="outline"
              disabled={order.ready || !order.lines.some((l) => !l.confirmed && !l.missing)}
              onClick={() => {
                setVoiceLine(order.lines.find((l) => !l.confirmed && !l.missing)?.id ?? "");
                setProposed(false);
                setVoice(true);
              }}
            >
              <Mic className="h-4 w-4" />
              Prova dialogo vocale
            </Button>
          </div>
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Articoli verificati</span>
            <span>
              {verified} di {order.lines.length}
            </span>
          </div>
          <div className="mb-4 flex h-1.5 gap-1">
            {order.lines.map((l) => (
              <div
                key={l.id}
                className={cn(
                  "flex-1 rounded-sm",
                  l.missing ? "bg-warning" : l.confirmed ? "bg-success" : "bg-muted",
                )}
              />
            ))}
          </div>
          <div data-tour="prep.righe" className="space-y-3">
            {order.lines.map((l) => (
              <article
                key={l.id}
                className={cn(
                  "rounded-lg border p-3 sm:p-4",
                  l.missing
                    ? "border-warning/50 bg-warning/5"
                    : l.confirmed
                      ? "border-success/30 bg-success/5"
                      : "border-border bg-card",
                )}
              >
                <div className="flex items-start gap-3">
                  <img
                    src={images[l.image]}
                    alt={l.name}
                    className="h-14 w-14 shrink-0 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{l.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Richiesti{" "}
                      <strong className="text-foreground">
                        {l.requested} {l.unit}
                      </strong>
                    </p>
                  </div>
                  {l.confirmed && <Check className="h-5 w-5 text-success" />}
                  {l.missing && <TriangleAlert className="h-5 w-5 text-warning" />}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`qty-${l.id}`}>Preparato ({l.unit})</Label>
                    <Input
                      id={`qty-${l.id}`}
                      inputMode="decimal"
                      disabled={l.confirmed || l.missing || order.ready}
                      value={l.prepared}
                      placeholder="—"
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        patchLine(l.id, (current) =>
                          updateLine(current, "prepared", e.target.value),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`weight-${l.id}`}>Peso effettivo (kg)</Label>
                    <Input
                      id={`weight-${l.id}`}
                      inputMode="decimal"
                      disabled={l.confirmed || l.missing || order.ready}
                      value={l.weight}
                      placeholder="Facoltativo"
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        patchLine(l.id, (current) => updateLine(current, "weight", e.target.value))
                      }
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  {l.missing ? (
                    <span className="text-sm font-medium text-warning-foreground">
                      Prodotto mancante
                    </span>
                  ) : l.confirmed ? (
                    <span className="flex items-center gap-1 text-sm text-success">
                      <Check className="h-4 w-4" />
                      Confermato
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        patchLine(l.id, (current) => ({
                          ...current,
                          missing: true,
                          confirmed: false,
                        }))
                      }
                    >
                      <TriangleAlert className="h-4 w-4" />
                      Mancante
                    </Button>
                  )}
                  {!order.ready &&
                    (l.confirmed || l.missing ? (
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Correggi ${l.name}`}
                        title="Correggi"
                        onClick={() =>
                          patchLine(l.id, (current) => ({
                            ...current,
                            confirmed: false,
                            missing: false,
                          }))
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={!canConfirm(l)}
                        onClick={() => patchLine(l.id, confirmLine)}
                      >
                        <Check className="h-4 w-4" />
                        Conferma riga
                      </Button>
                    ))}
                </div>
              </article>
            ))}
          </div>
          <div
            data-tour="prep.pronto"
            className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
          >
            <p className="text-sm text-muted-foreground">
              {order.lines.filter((l) => l.missing).length} mancanti · {verified}/
              {order.lines.length} verificati
            </p>
            <Button
              disabled={order.ready || !canComplete(order)}
              onClick={() => setReview(true)}
              className={order.ready ? "bg-success text-success-foreground" : ""}
            >
              <CheckCheck className="h-4 w-4" />
              {order.ready ? "Ordine pronto" : "Controlla e completa"}
            </Button>
          </div>
        </section>
      </div>
      <Dialog open={review} onOpenChange={setReview}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Riepilogo preparazione</DialogTitle>
            <DialogDescription>
              {order.id} · {order.customer} · {order.assignee} · Mockup
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border">
            {order.lines.map((l) => (
              <div key={l.id} className="py-3">
                <p className="font-medium">{l.name}</p>
                <p
                  className={cn(
                    "text-sm",
                    l.missing ? "text-warning-foreground" : "text-muted-foreground",
                  )}
                >
                  {l.missing
                    ? "Mancante — non incluso"
                    : `${l.prepared} ${l.unit} · Peso: ${l.weight || "—"} ${l.weight ? "kg" : ""}`}
                </p>
              </div>
            ))}
          </div>
          {order.lines.some((l) => l.missing) && (
            <p className="flex gap-2 text-sm text-warning-foreground">
              <TriangleAlert className="h-5 w-5 shrink-0" />
              L'ordine sarà pronto con articoli mancanti.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(false)}>
              Torna alle righe
            </Button>
            <Button
              onClick={() => {
                setOrders((all) =>
                  all.map((o) => (o.id === order.id && canComplete(o) ? { ...o, ready: true } : o)),
                );
                setReview(false);
              }}
            >
              Conferma ordine pronto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={voice} onOpenChange={setVoice}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialogo vocale · Demo</DialogTitle>
            <DialogDescription>Conversazione simulata · microfono non attivo</DialogDescription>
          </DialogHeader>
          <Label>Articolo</Label>
          <Select
            value={voiceLine}
            onValueChange={(v) => {
              setVoiceLine(v);
              setProposed(false);
            }}
          >
            <SelectTrigger aria-label="Articolo per dialogo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {order.lines
                .filter((l) => !l.confirmed && !l.missing)
                .map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <div className="space-y-3 border-l-2 border-primary pl-3">
            <p className="text-sm">
              Assistente: «Qual è il peso effettivo di {selectedVoiceLine?.name.toLowerCase()}?»
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="voice-weight">Risposta simulata (kg)</Label>
              <Input
                id="voice-weight"
                value={voiceWeight}
                inputMode="decimal"
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  setVoiceWeight(e.target.value);
                  setProposed(false);
                }}
              />
            </div>
            {proposed && (
              <p className="text-sm font-medium">
                Assistente: «Ho capito {voiceWeight} kg. Confermi questo peso?»
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoice(false)}>
              Annulla
            </Button>
            {proposed ? (
              <Button
                onClick={() => {
                  patchLine(voiceLine, (l) => updateLine(l, "weight", voiceWeight));
                  setVoice(false);
                }}
              >
                Conferma peso
              </Button>
            ) : (
              <Button
                disabled={
                  !Number.isFinite(Number(voiceWeight.replace(",", "."))) ||
                  Number(voiceWeight.replace(",", ".")) <= 0
                }
                onClick={() => setProposed(true)}
              >
                Proponi peso
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
