import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InventoryBulkReview } from "@/lib/inventory-confirm-all";
import { matchAllowedUnit, spokenNumber, spokenUnit } from "@/lib/tom/italian-quantity";
import { matchLocation, nextGuidedIndex } from "@/lib/tom/tom-commands";
import {
  getTomAvailability,
  logTomEvent,
  processTomInventoryPhrase,
  startTomInventorySession,
  type TomPhraseResult,
} from "@/lib/tom/tom.functions";

export type TomCard = {
  key: string;
  locationId: string;
  label: string;
  supplier: string | null;
  locked: boolean;
  draft: string;
  unitCode: string | null;
  unitId: string | null;
  counted: number | null;
  countedUnit: string | null;
  calculated: number | null;
  stockUnit: string | null;
};

export type TomInventoryController = {
  inventorySessionId: string | null;
  cards: TomCard[];
  locations: { id: string; name: string; code: string | null }[];
  selectedLocationId: string | null;
  canWrite: boolean;
  selectLocation: (id: string | null) => void;
  /** Scrive solo la bozza della card (stesso percorso della digitazione). false = card bloccata/non scrivibile. */
  applyDraft: (key: string, raw: string, unitId: string | null) => boolean;
  mark: (keys: Set<string>, current: string | null) => void;
  review: () => Promise<InventoryBulkReview | null>;
  confirmAll: () => Promise<void>;
  closeReview: () => void;
};

type Status = "idle" | "listening" | "hearing" | "thinking" | "speaking";

const SILENCE_END_MS = 900;
const MAX_PHRASE_MS = 12_000;
const IDLE_TIMEOUT_MS = 60_000;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}

async function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function itVoice() {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang?.toLowerCase().startsWith("it")) ?? null;
}

function cardName(card: TomCard, all: TomCard[]) {
  const same = all.filter((other) => other.label === card.label).length;
  return same > 1 && card.supplier ? `${card.label}, ${card.supplier}` : card.label;
}

function quantityPhrase(quantity: number, unitCode: string | null) {
  return `${spokenNumber(quantity)}${unitCode ? ` ${spokenUnit(unitCode, quantity)}` : ""}`;
}

export function TomInventoryButton({ companyId, controller }: { companyId: string; controller: TomInventoryController }) {
  const availability = useServerFn(getTomAvailability);
  const startSession = useServerFn(startTomInventorySession);
  const processPhrase = useServerFn(processTomInventoryPhrase);
  const logEvent = useServerFn(logTomEvent);
  const enabledQuery = useQuery({
    queryKey: ["tom-availability", companyId],
    queryFn: () => availability({ data: { companyId } }),
    staleTime: 5 * 60_000,
  });

  const [status, setStatus] = useState<Status>("idle");
  const [caption, setCaption] = useState<string>("");
  const [heard, setHeard] = useState<string>("");
  const ctrl = useRef(controller);
  ctrl.current = controller;

  const active = useRef(false);
  const tomSession = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const discard = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const vad = useRef({ speaking: false, speechStart: 0, lastVoice: 0, recStart: 0, lastActivity: 0, noise: 0.01 });
  const busy = useRef(false);
  const errors = useRef(0);
  const lastSpoken = useRef("");
  const guided = useRef<{ keys: string[]; index: number; done: Set<string> } | null>(null);
  const history = useRef<{ key: string; prevDraft: string; prevUnitId: string | null; quantity: number; unitCode: string | null }[]>([]);
  const marks = useRef(new Set<string>());
  const pending = useRef<{ cardKey: string; quantity: number } | null>(null);
  const awaitingConfirm = useRef(false);
  const mime = useRef<string>("");

  useEffect(() => () => { void stop(false); }, []);

  if (!enabledQuery.data?.enabled) return null;

  function publishMarks() {
    ctrl.current.mark(new Set(marks.current), guided.current ? guided.current.keys[guided.current.index] ?? null : null);
  }

  function speak(text: string) {
    lastSpoken.current = text;
    setCaption(text);
    if (typeof speechSynthesis === "undefined") return Promise.resolve();
    return new Promise<void>((resolve) => {
      setStatus("speaking");
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "it-IT";
      const voice = itVoice();
      if (voice) utterance.voice = voice;
      utterance.rate = 1.08;
      const done = () => { clearTimeout(safety); resolve(); };
      const safety = setTimeout(done, 2500 + text.length * 90);
      utterance.onend = done;
      utterance.onerror = done;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    });
  }

  function startRecorder() {
    if (!active.current || !streamRef.current) return;
    const rec = mime.current ? new MediaRecorder(streamRef.current, { mimeType: mime.current }) : new MediaRecorder(streamRef.current);
    chunks.current = [];
    discard.current = false;
    rec.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks.current, { type: rec.mimeType || mime.current || "audio/webm" });
      chunks.current = [];
      if (discard.current || !active.current) { if (active.current && !busy.current) startRecorder(); return; }
      void handlePhrase(blob);
    };
    rec.start();
    recorder.current = rec;
    vad.current = { ...vad.current, speaking: false, speechStart: 0, recStart: Date.now() };
    setStatus("listening");
  }

  function tick() {
    const node = analyser.current;
    const rec = recorder.current;
    if (!node || !rec || rec.state !== "recording" || busy.current) return;
    const buffer = new Float32Array(node.fftSize);
    node.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (const sample of buffer) sum += sample * sample;
    const level = Math.sqrt(sum / buffer.length);
    const now = Date.now();
    const state = vad.current;
    const threshold = Math.max(0.02, state.noise * 2.8);
    if (level > threshold) {
      if (!state.speaking) { state.speaking = true; state.speechStart = now; setStatus("hearing"); }
      state.lastVoice = now;
      state.lastActivity = now;
    } else if (!state.speaking) {
      state.noise = state.noise * 0.95 + level * 0.05;
    }
    if (state.speaking && (now - state.lastVoice > SILENCE_END_MS || now - state.speechStart > MAX_PHRASE_MS)) {
      busy.current = true;
      rec.stop();
      return;
    }
    if (!state.speaking && now - state.lastActivity > IDLE_TIMEOUT_MS) {
      void speak("Nessuna voce da un minuto: chiudo Tom.").then(() => stop(true));
      return;
    }
    if (!state.speaking && now - state.recStart > 15_000) {
      // Scarta il silenzio accumulato: niente audio inutile da inviare.
      discard.current = true;
      rec.stop();
    }
  }

  async function begin() {
    const c = ctrl.current;
    if (!c.inventorySessionId) { toast.info("Apri prima un inventario."); return; }
    if (!navigator.mediaDevices?.getUserMedia || pickMime() === null) {
      toast.error("Questo browser non permette di registrare la voce.");
      return;
    }
    // Sblocca la voce del browser con il tocco (necessario su iPhone).
    if (typeof speechSynthesis !== "undefined") speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      toast.error("Microfono non consentito: abilitalo nelle impostazioni del browser per usare Tom.");
      return;
    }
    try {
      const { tomSessionId } = await startSession({ data: { inventorySessionId: c.inventorySessionId } });
      tomSession.current = tomSessionId;
    } catch (error) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      toast.error(error instanceof Error ? error.message : "Tom non disponibile");
      return;
    }
    const ctx = new AudioContext();
    await ctx.resume().catch(() => undefined);
    const source = ctx.createMediaStreamSource(streamRef.current);
    const node = ctx.createAnalyser();
    node.fftSize = 1024;
    source.connect(node);
    audioCtx.current = ctx;
    analyser.current = node;
    mime.current = pickMime() ?? "";
    active.current = true;
    errors.current = 0;
    guided.current = null;
    history.current = [];
    pending.current = null;
    awaitingConfirm.current = false;
    vad.current.lastActivity = Date.now();
    timer.current = setInterval(tick, 80);
    await speak("Ciao, sono Tom. Dimmi prodotto e quantità, oppure: facciamo l'inventario della cella uno.");
    startRecorder();
  }

  async function stop(say: boolean) {
    const wasActive = active.current;
    active.current = false;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    discard.current = true;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    recorder.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    await audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
    busy.current = false;
    guided.current = null;
    if (wasActive) ctrl.current.mark(new Set(marks.current), null);
    setStatus("idle");
    if (say && wasActive) setCaption("Tom chiuso. Le quantità sono in bozza: conferma quando vuoi.");
  }

  function currentGuidedCard() {
    const g = guided.current;
    if (!g) return null;
    const key = g.keys[g.index];
    return ctrl.current.cards.find((card) => card.key === key) ?? null;
  }

  function askGuided(prefix = "") {
    const card = currentGuidedCard();
    publishMarks();
    if (!card) {
      guided.current = null;
      publishMarks();
      return speak(`${prefix}Ho finito le card di questa zona. Di' "conferma" per il riepilogo, oppure "fine".`);
    }
    document.querySelector(`[data-tom-card="${CSS.escape(card.key)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    return speak(`${prefix}${cardName(card, ctrl.current.cards)}, quante?`);
  }

  function advanceGuided(prefix: string) {
    const g = guided.current;
    if (!g) return speak(prefix.trim());
    const locked = new Set(ctrl.current.cards.filter((card) => card.locked).map((card) => card.key));
    g.index = nextGuidedIndex(g.keys, g.index, g.done, locked);
    if (g.index < 0) { g.index = g.keys.length; }
    return askGuided(prefix ? `${prefix} Prossimo: ` : "");
  }

  async function applySet(cardKey: string, quantity: number, unitId: string | null, unitCode: string | null) {
    const card = ctrl.current.cards.find((entry) => entry.key === cardKey);
    if (!card) return speak("Non trovo più quella card sullo schermo.");
    if (card.locked) {
      void logEvent({ data: { tomSessionId: tomSession.current!, outcome: "errore", note: "card confermata", cardKey } }).catch(() => undefined);
      return speak(`${cardName(card, ctrl.current.cards)} è già confermato: per cambiarlo sbloccalo col lucchetto.`);
    }
    const code = unitCode ?? card.unitCode;
    if (!code) {
      pending.current = { cardKey, quantity };
      return speak(`${cardName(card, ctrl.current.cards)}: in che unità? Casse, chili o pezzi?`);
    }
    history.current.push({ key: cardKey, prevDraft: card.draft, prevUnitId: card.unitId, quantity, unitCode: code });
    if (!ctrl.current.applyDraft(cardKey, String(quantity), unitId)) return speak("Non posso scrivere su questa card adesso.");
    pending.current = null;
    marks.current.add(cardKey);
    const said = `Segnate ${quantityPhrase(quantity, code)}${guided.current ? "." : ` per ${cardName(card, ctrl.current.cards)}.`}`;
    if (guided.current && guided.current.keys[guided.current.index] === cardKey) {
      guided.current.done.add(cardKey);
      return advanceGuided(said);
    }
    publishMarks();
    return speak(said);
  }

  async function startGuided(zone: string | null) {
    const c = ctrl.current;
    let locationId: string | null = c.selectedLocationId;
    if (zone) {
      const location = matchLocation(zone, c.locations);
      if (!location) return speak(`Non trovo la zona ${zone}. Le zone sono: ${c.locations.slice(0, 5).map((l) => l.name).join(", ")}.`);
      locationId = location.id;
      if (location.id !== c.selectedLocationId) {
        c.selectLocation(location.id);
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
    const cards = ctrl.current.cards.filter((card) => !locationId || card.locationId === locationId);
    const keys = cards.map((card) => card.key);
    const g = { keys, index: -1, done: new Set<string>() };
    guided.current = g;
    const locked = new Set(cards.filter((card) => card.locked).map((card) => card.key));
    g.index = nextGuidedIndex(keys, -1, g.done, locked);
    if (g.index < 0) { guided.current = null; return speak("Non ci sono card da contare con i filtri attuali."); }
    return askGuided(`Va bene, ${keys.length - locked.size} card. `);
  }

  async function runCommand(result: TomPhraseResult) {
    const c = ctrl.current;
    switch (result.kind) {
      case "none": return speak("Non ho sentito. Ripeti.");
      case "set": return applySet(result.cardKey, result.quantity, result.unitId, result.unitCode);
      case "ask_unit":
        pending.current = { cardKey: result.cardKey, quantity: result.quantity };
        return speak(`${result.label}: ${spokenNumber(result.quantity)} in che unità? ${result.options.map((o) => spokenUnit(o, 2)).join(" o ")}?`);
      case "ask": return speak(result.question);
      case "query": {
        const card = c.cards.find((entry) => entry.key === result.cardKey);
        if (!card) return speak("Non trovo la card.");
        if (card.draft.trim()) return speak(`${result.label}: in bozza ${card.draft.replace(".", ",")} ${card.unitCode ? spokenUnit(card.unitCode, 2) : ""}, non ancora confermato.`);
        if (card.counted !== null) return speak(`${result.label}: contate ${quantityPhrase(Number(card.counted), card.countedUnit)}.`);
        if (card.calculated !== null) return speak(`${result.label}: giacenza calcolata ${quantityPhrase(Number(card.calculated), card.stockUnit)}, non ancora contato.`);
        return speak(`${result.label}: non ancora contato.`);
      }
      case "start_guided": return startGuided(result.zone);
      case "quick": {
        const command = result.command;
        if (command.kind === "end") { await speak("Va bene, chiudo. Le quantità restano in bozza."); return stop(true); }
        if (command.kind === "repeat") return speak(lastSpoken.current || "Non ho ancora detto niente.");
        if (command.kind === "skip") {
          if (!guided.current) return speak("Salta funziona nell'inventario guidato.");
          return advanceGuided("Saltato.");
        }
        if (command.kind === "undo") {
          const last = history.current.pop();
          if (!last) return speak("Non c'è niente da annullare.");
          c.applyDraft(last.key, last.prevDraft, last.prevUnitId);
          if (!last.prevDraft.trim()) marks.current.delete(last.key);
          const card = c.cards.find((entry) => entry.key === last.key);
          if (guided.current) {
            const index = guided.current.keys.indexOf(last.key);
            if (index >= 0) { guided.current.done.delete(last.key); guided.current.index = index; }
            return askGuided("Annullato. ");
          }
          publishMarks();
          return speak(`Annullato${card ? `: ${cardName(card, c.cards)}` : ""}.`);
        }
        if (command.kind === "correct") {
          const last = history.current[history.current.length - 1];
          if (!last) return speak("Non c'è un valore da correggere.");
          if (command.quantity === null) return speak("Quante erano?");
          const card = c.cards.find((entry) => entry.key === last.key);
          if (command.unitWord && card?.unitCode && !matchAllowedUnit(command.unitWord, [{ id: "x", code: card.unitCode }])) {
            return speak(`Per cambiare unità di' il prodotto con la nuova unità, ad esempio: ${card.label} ${spokenNumber(command.quantity)} chili.`);
          }
          if (!c.applyDraft(last.key, String(command.quantity), null)) return speak("Non posso correggere questa card adesso.");
          last.quantity = command.quantity;
          return speak(`Corretto: ${quantityPhrase(command.quantity, last.unitCode)}.`);
        }
        if (command.kind === "summary") {
          const items = [...new Map(history.current.map((entry) => [entry.key, entry])).values()];
          if (!items.length) return speak("Non ho ancora segnato niente.");
          const names = items.slice(-5).map((entry) => {
            const card = c.cards.find((other) => other.key === entry.key);
            return `${card ? cardName(card, c.cards) : "prodotto"} ${quantityPhrase(entry.quantity, entry.unitCode)}`;
          });
          return speak(`Ho segnato ${items.length} ${items.length === 1 ? "prodotto" : "prodotti"}. Ultimi: ${names.join("; ")}.`);
        }
        if (command.kind === "confirm_all") {
          setStatus("thinking");
          const review = await c.review();
          if (!review) return speak("Non riesco a preparare il riepilogo. Controlla lo schermo.");
          if (!review.products.ready) { awaitingConfirm.current = false; return speak("Non ci sono quantità pronte da confermare."); }
          const diffs = review.differences.slice(0, 3).map((d) => `${d.label} ${spokenNumber(d.counted)} contro ${d.calculated === null ? "nessuna giacenza" : spokenNumber(d.calculated)}`);
          awaitingConfirm.current = true;
          return speak(`Riepilogo: ${review.products.ready} da confermare, ${review.products.empty} vuote che restano mai contate, ${review.products.blocked} bloccate.${diffs.length ? ` Differenze maggiori: ${diffs.join("; ")}.` : ""} Confermo tutto? Rispondi sì o no.`);
        }
        if (command.kind === "yes") {
          if (!awaitingConfirm.current) return speak("Non c'è niente da confermare. Di' prima: conferma.");
          awaitingConfirm.current = false;
          setStatus("thinking");
          try {
            await c.confirmAll();
            void logEvent({ data: { tomSessionId: tomSession.current!, outcome: "applicato", note: "conferma tutto a voce", cardKey: null } }).catch(() => undefined);
            history.current = [];
            return speak("Confermato. L'inventario resta aperto; per chiuderlo usa il pulsante.");
          } catch (error) {
            return speak(error instanceof Error ? error.message : "Conferma non riuscita.");
          }
        }
        if (command.kind === "no") {
          if (awaitingConfirm.current) { awaitingConfirm.current = false; c.closeReview(); return speak("Va bene, non confermo."); }
          return speak("D'accordo.");
        }
        return speak("Non ho capito. Ripeti.");
      }
    }
  }

  async function handlePhrase(blob: Blob) {
    busy.current = true;
    setStatus("thinking");
    try {
      if (blob.size < 1500) { busy.current = false; startRecorder(); return; }
      const c = ctrl.current;
      const g = guided.current;
      const response = await processPhrase({
        data: {
          tomSessionId: tomSession.current!,
          inventorySessionId: c.inventorySessionId!,
          audioBase64: await blobToBase64(blob),
          mime: blob.type || mime.current || "audio/webm",
          cardKeys: c.cards.slice(0, 500).map((card) => card.key),
          guidedCardKey: g ? g.keys[g.index] ?? null : null,
          pending: pending.current,
        },
      });
      setHeard(response.transcript);
      errors.current = 0;
      if (!c.canWrite && response.result.kind === "set") await speak("Aspetta un attimo: sto salvando.");
      else await runCommand(response.result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore";
      if (message.startsWith("STOP:") || /limite|non è attivo|non valida|inventario aperto/i.test(message)) {
        await speak(message.replace(/^STOP:/, ""));
        await stop(true);
        return;
      }
      errors.current += 1;
      if (errors.current >= 3) { await speak("Ho troppi problemi di collegamento. Chiudo Tom."); await stop(true); return; }
      await speak("Non ho capito, ripeti.");
    } finally {
      busy.current = false;
      vad.current.lastActivity = Date.now();
      if (active.current && (!recorder.current || recorder.current.state === "inactive")) startRecorder();
    }
  }

  const label = status === "idle" ? "Parla con Tom"
    : status === "speaking" ? "Tom parla…"
      : status === "thinking" ? "Tom pensa…"
        : status === "hearing" ? "Ti sento…" : "Tom ascolta…";

  return (
    <div data-hide-on-keyboard className="fixed right-3 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-30 flex max-w-[min(20rem,calc(100vw-1.5rem))] flex-col items-end gap-2 lg:bottom-28">
      {status !== "idle" || caption ? (
        <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg" aria-live="polite">
          <p className="font-semibold">{label}</p>
          {heard ? <p className="text-xs text-muted-foreground">«{heard}»</p> : null}
          {caption ? <p className="mt-1">{caption}</p> : null}
          {status === "idle" ? (
            <button type="button" className="mt-1 text-xs underline text-muted-foreground" onClick={() => { setCaption(""); setHeard(""); }}>Chiudi</button>
          ) : <p className="mt-1 text-[11px] text-muted-foreground">Di' «fine» per chiudere. Tom non conferma da solo.</p>}
        </div>
      ) : null}
      <Button
        type="button"
        size="icon"
        aria-label={status === "idle" ? "Avvia Tom, assistente vocale" : "Ferma Tom"}
        aria-pressed={status !== "idle"}
        onClick={() => { if (active.current) { void speak("Chiudo.").then(() => stop(true)); } else void begin(); }}
        className={cn(
          "size-14 rounded-full shadow-lg",
          status === "idle" ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground",
          (status === "listening" || status === "hearing") && "animate-pulse",
          status === "hearing" && "ring-4 ring-destructive/40",
        )}
      >
        {status === "thinking" ? <Loader2 className="size-6 animate-spin" /> : status === "idle" ? <Mic className="size-6" /> : <MicOff className="size-6" />}
      </Button>
    </div>
  );
}
