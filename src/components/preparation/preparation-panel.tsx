import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronRight,
  History,
  Info,
  Package,
  Pencil,
  Printer,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getPreparation, savePreparation } from "@/lib/preparation.functions";
import { getProductImageUrls } from "@/lib/product-images.functions";
import {
  canCompletePreparation,
  canConfirmPreparation,
  parsePreparationQuantity,
  preparationStatus,
  type PreparationCommand,
  type PreparationLine,
  type PreparationOrder,
} from "@/lib/preparation";
import { startPreparationGuide } from "@/lib/guides/preparation-guide";
import { cn } from "@/lib/utils";
import { printPreparation } from "./preparation-print";

export function RealPreparationGuideButton() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Aiuto su questa pagina">
          <Info className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => void startPreparationGuide(true)}>
          Guida completa
        </DropdownMenuItem>
        <DropdownMenuItem>Chiudi</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
const actions: Record<string, string> = {
  assign: "Preparatore assegnato",
  confirm: "Riga confermata",
  missing: "Prodotto mancante",
  unlock: "Riga sbloccata",
  ready: "Ordine pronto",
};
const fmt = (value: number | null) =>
  value === null ? "—" : new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 }).format(value);

export function PreparationPanel({ memberId, userId }: { memberId: string; userId: string }) {
  const read = useServerFn(getPreparation),
    write = useServerFn(savePreparation);
  const getImages = useServerFn(getProductImageUrls);
  const cache = useQueryClient();
  const queryKey = ["preparation", userId, memberId];
  const query = useQuery({
    queryKey,
    queryFn: () => read({ data: { memberId } }),
    refetchInterval: 15000,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Tutti");
  const [printIds, setPrintIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<
    Record<string, { quantity: string; weight: string; version: number; sourceSignature: string }>
  >({});
  const [review, setReview] = useState(false),
    [history, setHistory] = useState(false);
  const [reviewSnapshot, setReviewSnapshot] = useState<{ version: number; sourceSignature: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const orders = query.data?.orders ?? [];
  const members = query.data?.members ?? [];
  const order = orders.find((o) => o.id === selected);
  const productIds = [
    ...new Set((order?.lines ?? []).flatMap((l) => (l.sellerProductId ? [l.sellerProductId] : []))),
  ];
  const images = useQuery({
    queryKey: ["preparation-images", userId, memberId, ...productIds],
    enabled: productIds.length > 0,
    queryFn: () => getImages({ data: { productIds: productIds.slice(0, 50), thumbnail: true } }),
    staleTime: 300000,
  });
  const mutation = useMutation({
    mutationFn: (data: PreparationCommand) => write({ data }),
    onSuccess: async (_, data) => {
      setError(null);
      if (data.itemId)
        setDrafts((all) => {
          const next = { ...all };
          delete next[data.itemId ?? ""];
          return next;
        });
      if (data.action === "ready") setReview(false);
      await cache.invalidateQueries({ queryKey });
      toast.success(data.action === "ready" ? "Ordine pronto" : "Preparazione salvata");
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error(e.message);
      void cache.invalidateQueries({ queryKey });
    },
  });
  const command = (
    o: PreparationOrder,
    action: PreparationCommand["action"],
    extra: Partial<PreparationCommand> = {},
  ) => {
    setError(null);
    mutation.mutate({
      orderId: o.id,
      action,
      sourceSignature: o.sourceSignature,
      version: o.version,
      ...extra,
    });
  };
  const draftFor = (line: PreparationLine) =>
    drafts[line.id] ?? {
      quantity: line.prepared === null ? "" : String(line.prepared),
      weight: line.weight === null ? "" : String(line.weight),
      version: line.version,
      sourceSignature: order?.sourceSignature ?? "",
    };
  const changeDraft = (line: PreparationLine, field: "quantity" | "weight", value: string) =>
    setDrafts((all) => ({ ...all, [line.id]: { ...draftFor(line), [field]: value } }));
  const dirty = order?.lines.some((l) => Boolean(drafts[l.id])) ?? false;
  const [leave, setLeave] = useState(false);
  const back = () => {
    if (dirty) setLeave(true);
    else setSelected(null);
  };
  if (query.isPending)
    return (
      <p role="status" className="py-8 text-muted-foreground">
        Caricamento ordini…
      </p>
    );
  if (query.isError)
    return (
      <div role="alert" className="space-y-3">
        <p className="text-destructive">{query.error.message}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          <RefreshCw className="size-4" />
          Riprova
        </Button>
      </div>
    );
  const visible = orders.filter(
    (o) =>
      (filter === "Tutti" || preparationStatus(o) === filter) &&
      `${o.customer} ${o.number ?? ""}`
        .toLocaleLowerCase("it")
        .includes(search.toLocaleLowerCase("it")),
  );
  const locked = Boolean(order?.readyAt || order?.exportedAt);
  const busy = mutation.isPending;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="grid flex-1 grid-cols-3 gap-3">
          {["Da preparare", "In lavorazione", "Pronti"].map((s) => (
            <div key={s}>
              <p className="text-2xl font-semibold">
                {orders.filter((o) => preparationStatus(o) === s).length}
              </p>
              <p className="text-xs text-muted-foreground">{s}</p>
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Ricarica ordini"
          title="Ricarica ordini"
          disabled={busy || query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw
            className={cn("size-4", query.isFetching && "animate-spin motion-reduce:animate-none")}
          />
        </Button>
      </div>
      {error && (
        <div role="alert" className="border-l-2 border-destructive pl-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {!selected ? (
        <section data-tour="prep.elenco" className="space-y-4">
          <h2 className="font-semibold">
            Ordini per cliente <span className="text-muted-foreground">{orders.length}</span>
          </h2>
          <div data-tour="prep.filtri" className="flex flex-wrap gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                aria-label="Cerca cliente o ordine"
                placeholder="Cliente o numero ordine"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-44" aria-label="Stato ordini">
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
          {printIds.length > 0 && (
            <div
              data-tour="prep.stampa"
              className="flex flex-wrap items-center gap-2 border-y border-border py-3"
            >
              <span className="text-sm">{printIds.length} selezionati</span>
              <Button
                size="sm"
                onClick={() =>
                  printPreparation(
                    orders.filter((o) => printIds.includes(o.id)),
                    members,
                  )
                }
              >
                <Printer className="size-4" />
                Stampa selezionati
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPrintIds([])}>
                Annulla selezione
              </Button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((o) => (
              <div key={o.id} className="relative">
                <Checkbox
                  className="absolute left-3 top-3 z-10 bg-background"
                  aria-label={`Seleziona ${o.number} per la stampa`}
                  checked={printIds.includes(o.id)}
                  onCheckedChange={(checked) =>
                    setPrintIds((all) =>
                      checked
                        ? [...all.filter((id) => id !== o.id), o.id]
                        : all.filter((id) => id !== o.id),
                    )
                  }
                />
                <Button
                  variant="outline"
                  className={cn(
                    "h-auto min-h-36 w-full items-start justify-start whitespace-normal p-4 pl-10 text-left",
                    o.readyAt && "border-success/40 bg-success/5",
                  )}
                  onClick={() => {
                    setSelected(o.id);
                    setError(null);
                  }}
                >
                  <div className="min-w-0 w-full space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {o.number} · {o.deliveryDate ?? "Data non indicata"} {o.timeFrom?.slice(0, 5)}
                    </p>
                    <p className="break-words font-semibold">{o.customer}</p>
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className={o.readyAt ? "text-success" : ""}>
                        {preparationStatus(o)}
                      </Badge>
                      <ChevronRight className="size-4 shrink-0" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {o.lines.filter((l) => l.state !== "pending" && !l.sourceChanged).length}/
                      {o.lines.length} articoli ·{" "}
                      {members.find((m) => m.id === o.assignedMemberId)?.name ?? "Non assegnato"}
                    </p>
                    {o.exportedAt && <Badge variant="secondary">Scaricato da Danea</Badge>}
                  </div>
                </Button>
              </div>
            ))}
          </div>
          {!visible.length && (
            <p className="py-8 text-sm text-muted-foreground">
              {orders.length
                ? "Nessun ordine con questi filtri."
                : "Nessun ordine ricevuto da preparare."}
            </p>
          )}
        </section>
      ) : !order ? (
        <div className="space-y-3">
          <p>Ordine non più disponibile in Preparazione.</p>
          <Button variant="outline" onClick={() => setSelected(null)}>
            <ArrowLeft className="size-4" />
            Torna agli ordini
          </Button>
        </div>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={back}>
              <ArrowLeft className="size-4" />
              Torna agli ordini
            </Button>
            <Button
              data-tour="prep.stampa"
              variant="outline"
              size="sm"
              onClick={() => printPreparation([order], members)}
            >
              <Printer className="size-4" />
              Stampa ordine
            </Button>
          </div>
          <header className="border-b border-border pb-4">
            <p className="text-xs text-muted-foreground">
              {order.number} · {order.deliveryDate ?? "Data non indicata"} ·{" "}
              {order.timeFrom?.slice(0, 5) ?? "Orario non indicato"}
              {order.timeTo ? `–${order.timeTo.slice(0, 5)}` : ""}
            </p>
            <h2 className="mt-1 break-words text-xl font-semibold">{order.customer}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {order.address ?? "Indirizzo non indicato"}
            </p>
            {order.notes && (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">{order.notes}</p>
            )}
            <Badge className="mt-3" variant="outline">
              {preparationStatus(order)}
            </Badge>
          </header>
          {order.exportedAt && (
            <p className="border-l-2 border-warning pl-3 text-sm text-warning-foreground">
              Scaricato da Danea · sola consultazione. I pesi di Preparazione non aggiornano il
              documento già scaricato.
            </p>
          )}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div data-tour="prep.preparatore" className="w-56 space-y-1.5">
              <Label>Preparatore</Label>
              <Select
                disabled={locked || busy}
                value={order.assignedMemberId ?? "none"}
                onValueChange={(id) =>
                  command(order, "assign", { assignedMemberId: id === "none" ? null : id })
                }
              >
                <SelectTrigger aria-label="Preparatore">
                  <SelectValue placeholder="Non assegnato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non assegnato</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              data-tour="prep.storico"
              variant="outline"
              size="sm"
              onClick={() => setHistory(true)}
            >
              <History className="size-4" />
              Storico
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {order.lines.filter((l) => l.state !== "pending" && !l.sourceChanged).length} di{" "}
            {order.lines.length} articoli verificati
          </p>
          <div data-tour="prep.righe" className="space-y-3">
            {order.lines.map((l) => {
              const draft = draftFor(l),
                stale = drafts[l.id] !== undefined && (drafts[l.id]?.version !== l.version || drafts[l.id]?.sourceSignature !== order.sourceSignature);
              const photo = images.data?.find((p) => p.productId === l.sellerProductId);
              return (
                <article
                  key={l.id}
                  className={cn(
                    "rounded-lg border p-3 sm:p-4",
                    l.state === "missing"
                      ? "border-warning/50 bg-warning/5"
                      : l.state === "confirmed"
                        ? "border-success/30 bg-success/5"
                        : "border-border bg-card",
                  )}
                >
                  <div className="flex items-start gap-3">
                    {photo ? (
                      <img
                        src={photo.url}
                        alt={l.name ?? "Prodotto"}
                        className="size-14 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Package className="size-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-semibold">{l.name ?? "Prodotto"}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Richiesti{" "}
                        <strong className="text-foreground">
                          {fmt(l.requested)} {l.unit ?? "U.M. non indicata"}
                        </strong>
                      </p>
                      {l.notes && (
                        <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                          {l.notes}
                        </p>
                      )}
                    </div>
                    {l.state === "confirmed" && <Check className="size-5 shrink-0 text-success" />}
                    {l.state === "missing" && (
                      <TriangleAlert className="size-5 shrink-0 text-warning" />
                    )}
                  </div>
                  {(l.sourceChanged || stale) && (
                    <p role="alert" className="mt-3 text-sm text-warning-foreground">
                      {stale
                        ? "Riga aggiornata da un altro preparatore. I tuoi valori non sono stati salvati."
                        : "L'ordine originale è cambiato: correggi e riconferma la riga."}
                    </p>
                  )}
                  {stale && (
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDrafts((all) => {
                          const next = { ...all };
                          delete next[l.id];
                          return next;
                        })
                      }
                    >
                      <RefreshCw className="size-4" />
                      Usa i dati salvati
                    </Button>
                  )}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`prep-q-${l.id}`}>Preparato ({l.unit ?? "—"})</Label>
                      <Input
                        id={`prep-q-${l.id}`}
                        inputMode="decimal"
                        value={draft.quantity}
                        placeholder="—"
                        disabled={locked || busy || l.state !== "pending" || Boolean(stale)}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => changeDraft(l, "quantity", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`prep-w-${l.id}`}>Peso effettivo (kg)</Label>
                      <Input
                        id={`prep-w-${l.id}`}
                        inputMode="decimal"
                        value={draft.weight}
                        placeholder="Facoltativo"
                        disabled={locked || busy || l.state !== "pending" || Boolean(stale)}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => changeDraft(l, "weight", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-sm",
                        l.state === "missing" ? "text-warning-foreground" : "text-muted-foreground",
                      )}
                    >
                      {l.state === "missing"
                        ? "Prodotto mancante"
                        : l.state === "confirmed"
                          ? "Confermato"
                          : "Da verificare"}
                    </span>
                    {!locked &&
                      (l.state === "pending" ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy || Boolean(stale)}
                            onClick={() =>
                              command(order, "missing", { itemId: l.id, lineVersion: l.version })
                            }
                          >
                            <TriangleAlert className="size-4" />
                            Mancante
                          </Button>
                          <Button
                            size="sm"
                            disabled={
                              busy ||
                              Boolean(stale) ||
                              !canConfirmPreparation(l, draft.quantity, draft.weight)
                            }
                            onClick={() =>
                              command(order, "confirm", {
                                itemId: l.id,
                                lineVersion: draft.version,
                                quantity: parsePreparationQuantity(draft.quantity),
                                weightKg: parsePreparationQuantity(draft.weight),
                              })
                            }
                          >
                            <Check className="size-4" />
                            Conferma riga
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="icon"
                          variant="outline"
                          disabled={busy}
                          title="Correggi"
                          aria-label={`Correggi ${l.name}`}
                          onClick={() =>
                            command(order, "unlock", { itemId: l.id, lineVersion: l.version })
                          }
                        >
                          <Pencil className="size-4" />
                        </Button>
                      ))}
                  </div>
                  {l.confirmedAt && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Conferma: {new Date(l.confirmedAt).toLocaleString("it-IT")} ·{" "}
                      {order.events.find((e) => e.actorUserId === l.confirmedBy)?.actor ??
                        "Operatore"}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          <div
            data-tour="prep.pronto"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
          >
            <p className="text-sm text-muted-foreground">
              {order.lines.filter((l) => l.state === "missing").length} mancanti
              {dirty ? " · Valori non confermati" : ""}
            </p>
            <Button
              disabled={locked || busy || dirty || !canCompletePreparation(order, members)}
              onClick={() => { setReviewSnapshot({version: order.version, sourceSignature: order.sourceSignature}); setReview(true); }}
            >
              <CheckCheck className="size-4" />
              {order.readyAt ? "Ordine pronto" : "Controlla e completa"}
            </Button>
          </div>
        </section>
      )}
      <Dialog open={review} onOpenChange={setReview}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Riepilogo preparazione</DialogTitle>
            <DialogDescription>
              {order?.number} · {order?.customer}
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border">
            {order?.lines.map((l) => (
              <div key={l.id} className="py-3">
                <p className="font-medium">{l.name}</p>
                <p
                  className={cn(
                    "text-sm",
                    l.state === "missing" ? "text-warning-foreground" : "text-muted-foreground",
                  )}
                >
                  {l.state === "missing"
                    ? "Mancante — non incluso"
                    : `${fmt(l.prepared)} ${l.unit} · Peso: ${fmt(l.weight)} kg`}
                </p>
              </div>
            ))}
          </div>
          {order?.lines.some((l) => l.state === "missing") && (
            <p className="text-sm text-warning-foreground">
              L'ordine sarà pronto con articoli mancanti.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setReview(false)}>
              Torna alle righe
            </Button>
            <Button
              disabled={busy || !order || !canCompletePreparation(order, members) || reviewSnapshot?.version !== order.version || reviewSnapshot?.sourceSignature !== order.sourceSignature}
              onClick={() => {
                if (order && reviewSnapshot) command(order, "ready", reviewSnapshot);
              }}
            >
              Conferma ordine pronto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={history} onOpenChange={setHistory}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Storico preparazione</DialogTitle>
            <DialogDescription>
              {order?.number} · {order?.customer}
            </DialogDescription>
          </DialogHeader>
          {!order?.events.length && (
            <p className="text-sm text-muted-foreground">Nessuna operazione registrata.</p>
          )}
          <ol className="divide-y divide-border">
            {order?.events.map((e) => (
              <li className="space-y-1 py-3" key={e.id}>
                <p className="font-medium">
                  {actions[e.action] ?? e.action}
                  {e.itemId
                    ? ` · ${order.lines.find((l) => l.id === e.itemId)?.name ?? "Articolo"}`
                    : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  {e.actor} · {new Date(e.at).toLocaleString("it-IT")}
                </p>
                {e.action === "confirm" && (
                  <p className="text-sm">
                    {String(e.after["prepared_quantity"] ?? "—")}{" "}
                    {String(e.after["unit_code"] ?? "")} · Peso:{" "}
                    {String(e.after["effective_weight_kg"] ?? "—")} kg
                  </p>
                )}
                {e.assignedMemberId && (
                  <p className="text-xs text-muted-foreground">
                    Preparatore:{" "}
                    {members.find((m) => m.id === e.assignedMemberId)?.name ?? "Non più attivo"}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
      <Dialog open={leave} onOpenChange={setLeave}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quantità non confermate</DialogTitle>
            <DialogDescription>
              I valori inseriti restano nella pagina, ma non sono ancora salvati.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeave(false)}>
              Resta nell'ordine
            </Button>
            <Button
              onClick={() => {
                setLeave(false);
                setSelected(null);
              }}
            >
              Torna agli ordini
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
