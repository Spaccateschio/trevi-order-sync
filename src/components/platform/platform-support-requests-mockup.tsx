import { useState } from "react";
import { Image, Lightbulb, LifeBuoy, MessageSquareText, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  filterSupportRequests,
  MOCK_SUPPORT_REQUESTS,
  supportKindLabel,
  supportStatusLabel,
  type SupportRequestKind,
  type SupportRequestMock,
  type SupportRequestStatus,
} from "@/lib/support-request-mock";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: SupportRequestStatus }) {
  return <Badge variant={status === "nuova" ? "default" : status === "in_lavorazione" ? "secondary" : "outline"}>{supportStatusLabel(status)}</Badge>;
}

export function PlatformSupportRequestsMockup() {
  const [requests, setRequests] = useState<SupportRequestMock[]>(MOCK_SUPPORT_REQUESTS);
  const [selectedId, setSelectedId] = useState(MOCK_SUPPORT_REQUESTS[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SupportRequestKind | "tutti">("tutti");
  const [status, setStatus] = useState<SupportRequestStatus | "tutte">("tutte");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedReplyId, setSavedReplyId] = useState<string | null>(null);

  const filtered = filterSupportRequests(requests, { query, kind, status });
  const selected = filtered.find((request) => request.id === selectedId) ?? filtered[0] ?? null;
  const newCount = requests.filter((request) => request.status === "nuova").length;

  function updateSelected(patch: Partial<SupportRequestMock>) {
    if (!selected) return;
    setRequests((current) => current.map((request) => request.id === selected.id ? { ...request, ...patch } : request));
  }

  function saveReply() {
    if (!selected) return;
    const adminReply = (drafts[selected.id] ?? selected.adminReply ?? "").trim();
    if (!adminReply) return;
    updateSelected({ adminReply });
    setSavedReplyId(selected.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Dati dimostrativi</Badge>
        <p className="text-xs text-muted-foreground">Risposte e stati cambiano solo in questa anteprima.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca richiesta, utente o azienda…" aria-label="Cerca richieste" className="pl-9" />
        </div>
        <Select value={kind} onValueChange={(value) => setKind(value as SupportRequestKind | "tutti")}>
          <SelectTrigger aria-label="Filtra per tipo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i tipi</SelectItem>
            <SelectItem value="assistenza">Assistenza</SelectItem>
            <SelectItem value="miglioramento">Miglioramenti</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(value) => setStatus(value as SupportRequestStatus | "tutte")}>
          <SelectTrigger aria-label="Filtra per stato"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutte">Tutti gli stati</SelectItem>
            <SelectItem value="nuova">Nuove ({newCount})</SelectItem>
            <SelectItem value="in_lavorazione">In lavorazione</SelectItem>
            <SelectItem value="risolta">Risolte</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{filtered.length} richieste corrispondenti</p>
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">Nessuna richiesta con questi filtri.</div>
          ) : filtered.map((request) => (
            <button
              key={request.id}
              type="button"
              onClick={() => {
                setSelectedId(request.id);
                setSavedReplyId(null);
              }}
              className={cn(
                "w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/50",
                selected?.id === request.id ? "border-primary ring-1 ring-primary" : "border-border",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {request.kind === "assistenza" ? <LifeBuoy className="h-4 w-4 text-primary" aria-hidden /> : <Lightbulb className="h-4 w-4 text-primary" aria-hidden />}
                <Badge variant="secondary">{supportKindLabel(request.kind)}</Badge>
                <StatusBadge status={request.status} />
                <span className="ml-auto text-[11px] text-muted-foreground">{request.id}</span>
              </div>
              <h3 className="mt-3 text-sm font-semibold">{request.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{request.details}</p>
              <div className="mt-3 flex flex-wrap justify-between gap-1 text-xs text-muted-foreground">
                <span>{request.author} · {request.company}</span>
                <span>{request.createdAt}</span>
              </div>
            </button>
          ))}
        </div>

        {selected ? (
          <Card className="lg:sticky lg:top-36">
            <CardContent className="space-y-5 py-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{supportKindLabel(selected.kind)}</Badge>
                  <StatusBadge status={selected.status} />
                  <span className="text-xs text-muted-foreground">{selected.id}</span>
                </div>
                <h2 className="mt-3 text-lg font-semibold">{selected.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{selected.author} · {selected.company} · {selected.createdAt}</p>
              </div>

              <div className="rounded-md bg-muted p-3">
                <p className="whitespace-pre-wrap text-sm">{selected.details}</p>
                <p className="mt-3 text-xs text-muted-foreground">Pagina: <span className="font-medium text-foreground">{selected.page}</span></p>
                {selected.screenshotName ? <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Image className="h-3.5 w-3.5" aria-hidden /> Schermata allegata: {selected.screenshotName}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-admin-reply" className="flex items-center gap-2"><MessageSquareText className="h-4 w-4" aria-hidden /> Risposta all’utente</Label>
                <Textarea
                  id="support-admin-reply"
                  value={drafts[selected.id] ?? selected.adminReply ?? ""}
                  onChange={(event) => {
                    setDrafts((current) => ({ ...current, [selected.id]: event.target.value }));
                    setSavedReplyId(null);
                  }}
                  placeholder="Scrivi una risposta chiara e utile…"
                  className="min-h-24"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={saveReply} disabled={!(drafts[selected.id] ?? selected.adminReply ?? "").trim()}>Salva risposta dimostrativa</Button>
                  {savedReplyId === selected.id ? <span className="text-xs text-muted-foreground">Salvata solo nell’anteprima.</span> : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <span className="mr-1 text-xs font-medium text-muted-foreground">Stato:</span>
                {(["nuova", "in_lavorazione", "risolta"] as const).map((value) => (
                  <Button key={value} type="button" size="sm" variant={selected.status === value ? "default" : "outline"} onClick={() => updateSelected({ status: value })} aria-pressed={selected.status === value}>
                    {supportStatusLabel(value)}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
