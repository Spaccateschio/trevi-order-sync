import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { InventoryLocationsManager, useInventoryLocations } from "./inventory-locations-manager";
import { InventoryRequirementsPanel } from "./inventory-requirements-panel";
import { InventorySessionCounter } from "./inventory-session-counter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { dateTimeShort, SESSION_STATUS_LABEL, type SessionRow } from "@/lib/inventory";
import { ensureDefaultInventoryLocation, manageInventorySession } from "@/lib/inventory.functions";

type Archive = { id: string; name: string; is_default: boolean };

export function InventoryPanel({ companyId, isAdmin }: { companyId: string; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const ensureDefault = useServerFn(ensureDefaultInventoryLocation);
  const runSession = useServerFn(manageInventorySession);
  const locationsQuery = useInventoryLocations(companyId);
  const locations = locationsQuery.data ?? [];
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", archiveId: "", scope: "generale", locationId: "" });

  const archivesQuery = useQuery({
    queryKey: ["inventory-archives", companyId],
    queryFn: async (): Promise<Archive[]> => {
      const { data, error } = await supabase
        .from("danea_archives")
        .select("id, name, is_default")
        .eq("company_id", companyId)
        .eq("status", "attivo")
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Archive[];
    },
  });

  const sessionsQuery = useQuery({
    queryKey: ["inventory-sessions", companyId],
    queryFn: async (): Promise<SessionRow[]> => {
      const { data, error } = await supabase
        .from("inventory_sessions")
        .select("id, name, scope, location_id, status, archive_id, started_at, finished_at, notes")
        .eq("company_id", companyId)
        .order("started_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as SessionRow[];
    },
  });

  // La zona predefinita viene creata al primo ingresso: chi ha un solo magazzino non configura nulla.
  useEffect(() => {
    if (!isAdmin || !locationsQuery.isSuccess || locationsQuery.data.length) return;
    void ensureDefault({ data: { companyId } }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["inventory-locations", companyId] }),
    );
  }, [isAdmin, locationsQuery.isSuccess, locationsQuery.data, companyId, ensureDefault, queryClient]);

  useEffect(() => {
    const archives = archivesQuery.data ?? [];
    if (!draft.archiveId && archives.length) {
      setDraft((current) => ({ ...current, archiveId: archives[0]!.id }));
    }
  }, [archivesQuery.data, draft.archiveId]);

  const sessionMutation = useMutation({
    mutationFn: (input: {
      action: "open" | "close" | "cancel";
      sessionId?: string;
    }) =>
      runSession({
        data: {
          companyId,
          action: input.action,
          sessionId: input.sessionId ?? null,
          archiveId: input.action === "open" ? draft.archiveId : null,
          name: input.action === "open" ? draft.name || null : null,
          scope: input.action === "open" ? (draft.scope as "generale" | "ubicazione") : "generale",
          locationId: input.action === "open" && draft.scope === "ubicazione" ? draft.locationId : null,
          notes: null,
        },
      }),
    onSuccess: async (result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["inventory-sessions", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["inventory-requirements", companyId] });
      if (variables.action === "open") {
        setOpenSessionId(result.id);
        setNewOpen(false);
        toast.success("Sessione di inventario aperta");
      } else if (variables.action === "close") {
        toast.success("Sessione chiusa: da adesso si correggono solo con rettifiche");
      } else {
        toast.success("Sessione annullata");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sessions = sessionsQuery.data ?? [];
  const selected = useMemo(
    () => sessions.find((row) => row.id === openSessionId) ?? sessions.find((row) => row.status === "in_corso") ?? null,
    [sessions, openSessionId],
  );
  const activeLocations = locations.filter((row) => row.status === "attivo");
  const archiveName = (id: string) => archivesQuery.data?.find((row) => row.id === id)?.name ?? "—";

  return (
    <Tabs defaultValue="conteggio" className="space-y-4">
      <TabsList>
        <TabsTrigger value="conteggio">Conteggio</TabsTrigger>
        <TabsTrigger value="fabbisogno">Fabbisogno</TabsTrigger>
        <TabsTrigger value="zone">Zone</TabsTrigger>
      </TabsList>

      <TabsContent value="conteggio" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selected?.id ?? ""} onValueChange={setOpenSessionId}>
              <SelectTrigger className="w-full sm:w-72" aria-label="Sessione di inventario">
                <SelectValue placeholder="Scegli una sessione" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name} · {SESSION_STATUS_LABEL[row.status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected ? (
              <Badge variant={selected.status === "in_corso" ? "default" : "secondary"}>
                {SESSION_STATUS_LABEL[selected.status]}
              </Badge>
            ) : null}
          </div>
          {isAdmin ? (
            <div className="flex flex-wrap gap-2">
              {selected?.status === "in_corso" ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={sessionMutation.isPending}
                    onClick={() => sessionMutation.mutate({ action: "cancel", sessionId: selected.id })}
                  >
                    Annulla sessione
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={sessionMutation.isPending}
                    onClick={() => sessionMutation.mutate({ action: "close", sessionId: selected.id })}
                  >
                    Chiudi sessione
                  </Button>
                </>
              ) : null}
              <Button type="button" size="sm" variant="outline" onClick={() => setNewOpen(true)}>
                <Plus aria-hidden="true" />
                Nuova sessione
              </Button>
            </div>
          ) : null}
        </div>

        {selected ? (
          <>
            <p className="text-xs text-muted-foreground">
              {archiveName(selected.archive_id)} ·{" "}
              {selected.scope === "generale"
                ? "tutte le zone"
                : `zona ${activeLocations.find((row) => row.id === selected.location_id)?.name ?? "—"}`}{" "}
              · iniziata {dateTimeShort(selected.started_at)}
              {selected.finished_at ? ` · chiusa ${dateTimeShort(selected.finished_at)}` : ""}
            </p>
            <InventorySessionCounter companyId={companyId} session={selected} locations={locations} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nessuna sessione: aprine una per iniziare il conteggio.
          </p>
        )}
      </TabsContent>

      <TabsContent value="fabbisogno">
        {archivesQuery.data?.length ? (
          <InventoryRequirementsPanel companyId={companyId} archiveId={archivesQuery.data[0]!.id} />
        ) : (
          <p className="text-sm text-muted-foreground">Nessun archivio disponibile.</p>
        )}
      </TabsContent>

      <TabsContent value="zone">
        <InventoryLocationsManager companyId={companyId} isAdmin={isAdmin} />
      </TabsContent>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuova sessione di inventario</DialogTitle>
            <DialogDescription>
              Puoi contare tutte le zone o soltanto una: contare il frigo non tocca le quantità delle altre zone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm">
              Nome
              <Input
                className="mt-1"
                value={draft.name}
                placeholder="Inventario serale"
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="block text-sm">
              Archivio
              <Select
                value={draft.archiveId}
                onValueChange={(value) => setDraft((current) => ({ ...current, archiveId: value }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Archivio" />
                </SelectTrigger>
                <SelectContent>
                  {(archivesQuery.data ?? []).map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block text-sm">
              Tipo di conteggio
              <Select
                value={draft.scope}
                onValueChange={(value) => setDraft((current) => ({ ...current, scope: value }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="generale">Tutte le zone</SelectItem>
                  <SelectItem value="ubicazione">Una sola zona</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {draft.scope === "ubicazione" ? (
              <label className="block text-sm">
                Zona
                <Select
                  value={draft.locationId}
                  onValueChange={(value) => setDraft((current) => ({ ...current, locationId: value }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Zona" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeLocations.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewOpen(false)}>
              Annulla
            </Button>
            <Button
              type="button"
              disabled={
                sessionMutation.isPending ||
                !draft.archiveId ||
                (draft.scope === "ubicazione" && !draft.locationId)
              }
              onClick={() => sessionMutation.mutate({ action: "open" })}
            >
              Apri sessione
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
