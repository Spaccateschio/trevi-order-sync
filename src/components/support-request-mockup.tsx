import { useState, type FormEvent } from "react";
import { useRouterState } from "@tanstack/react-router";
import { CheckCircle2, Image, Lightbulb, LifeBuoy, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createLocalSupportRequest,
  supportKindLabel,
  supportStatusLabel,
  type SupportRequestKind,
  type SupportRequestMock,
} from "@/lib/support-request-mock";

export function SupportRequestDialogMockup({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [tab, setTab] = useState("nuova");
  const [kind, setKind] = useState<SupportRequestKind>("assistenza");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [screenshotName, setScreenshotName] = useState("");
  const [requests, setRequests] = useState<SupportRequestMock[]>([]);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  function resetForm() {
    setTitle("");
    setDetails("");
    setScreenshotName("");
    setSubmittedId(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !details.trim()) return;
    const request = createLocalSupportRequest(
      {
        kind,
        title,
        details,
        page: pathname,
        ...(screenshotName ? { screenshotName } : {}),
      },
      requests.length + 4,
    );
    setRequests((current) => [request, ...current]);
    setSubmittedId(request.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Assistenza e idee</DialogTitle>
            <Badge variant="outline">Anteprima</Badge>
          </div>
          <DialogDescription>
            Chiedi aiuto o proponi un miglioramento al responsabile dell’app.
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-md border border-accent/40 bg-accent/10 p-3 text-xs text-muted-foreground">
          Dimostrazione: le richieste restano solo in questa schermata e non vengono inviate.
        </p>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="nuova">Nuova richiesta</TabsTrigger>
            <TabsTrigger value="mie">Le mie richieste ({requests.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="nuova" className="mt-4">
            {submittedId ? (
              <div className="space-y-4 rounded-lg border border-border bg-card p-5 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-primary" aria-hidden />
                <div>
                  <h3 className="font-semibold">Richiesta dimostrativa creata</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Riferimento {submittedId}. In questa anteprima non è stata inviata.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={() => setTab("mie")}>Vedi le mie richieste</Button>
                  <Button onClick={resetForm}>Nuova richiesta</Button>
                </div>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Di che cosa hai bisogno?</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={kind === "assistenza" ? "default" : "outline"}
                      aria-pressed={kind === "assistenza"}
                      onClick={() => setKind("assistenza")}
                      className="h-auto justify-start px-3 py-3"
                    >
                      <LifeBuoy className="h-5 w-5" aria-hidden />
                      <span className="text-left"><span className="block">Assistenza</span><span className="block text-xs font-normal opacity-80">Qualcosa non funziona</span></span>
                    </Button>
                    <Button
                      type="button"
                      variant={kind === "miglioramento" ? "default" : "outline"}
                      aria-pressed={kind === "miglioramento"}
                      onClick={() => setKind("miglioramento")}
                      className="h-auto justify-start px-3 py-3"
                    >
                      <Lightbulb className="h-5 w-5" aria-hidden />
                      <span className="text-left"><span className="block">Miglioramento</span><span className="block text-xs font-normal opacity-80">Proponi un’idea</span></span>
                    </Button>
                  </div>
                </fieldset>

                <div className="space-y-2">
                  <Label htmlFor="support-title">Titolo</Label>
                  <Input
                    id="support-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={kind === "assistenza" ? "Che cosa non riesci a fare?" : "Che cosa vorresti migliorare?"}
                    maxLength={120}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="support-details">Spiegaci cosa succede</Label>
                  <Textarea
                    id="support-details"
                    value={details}
                    onChange={(event) => setDetails(event.target.value)}
                    placeholder="Descrivi il problema o la tua proposta con parole semplici…"
                    className="min-h-28"
                    maxLength={2000}
                    required
                  />
                </div>

                <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  Pagina dalla quale scrivi: <span className="font-medium text-foreground">{pathname}</span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="support-screenshot">Schermata (facoltativa)</Label>
                  <Input
                    id="support-screenshot"
                    type="file"
                    accept="image/*"
                    onChange={(event) => setScreenshotName(event.target.files?.[0]?.name ?? "")}
                    className="sr-only"
                  />
                  <label htmlFor="support-screenshot" className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                    <Image className="h-4 w-4" aria-hidden />
                    {screenshotName ? "Cambia schermata" : "Scegli schermata"}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {screenshotName ? `${screenshotName} — selezionata solo localmente` : "Aiuta a mostrare l’errore; non viene caricata in questa anteprima."}
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={!title.trim() || !details.trim()}>
                  <Send className="h-4 w-4" aria-hidden />
                  Crea richiesta dimostrativa
                </Button>
              </form>
            )}
          </TabsContent>

          <TabsContent value="mie" className="mt-4 space-y-3">
            {requests.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-10 text-center">
                <p className="text-sm font-medium">Nessuna richiesta in questa anteprima</p>
                <p className="mt-1 text-xs text-muted-foreground">Le richieste create qui compariranno in questo elenco.</p>
              </div>
            ) : requests.map((request) => (
              <article key={request.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{supportKindLabel(request.kind)}</Badge>
                  <Badge variant="outline">{supportStatusLabel(request.status)}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">{request.id}</span>
                </div>
                <h3 className="mt-3 text-sm font-semibold">{request.title}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{request.details}</p>
                {request.screenshotName ? <p className="mt-2 text-xs text-muted-foreground">Schermata: {request.screenshotName}</p> : null}
              </article>
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
