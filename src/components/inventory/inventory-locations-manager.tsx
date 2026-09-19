import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Plus, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { manageInventoryLocation } from "@/lib/inventory.functions";
import type { LocationRow } from "@/lib/inventory";

export const locationsQueryKey = (companyId: string) => ["inventory-locations", companyId] as const;

export function useInventoryLocations(companyId: string) {
  return useQuery({
    queryKey: locationsQueryKey(companyId),
    queryFn: async (): Promise<LocationRow[]> => {
      const { data, error } = await supabase
        .from("inventory_locations")
        .select("id, name, code, is_default, status, notes")
        .eq("company_id", companyId)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as LocationRow[];
    },
  });
}

export function InventoryLocationsManager({
  companyId,
  isAdmin,
}: {
  companyId: string;
  isAdmin: boolean;
}) {
  const { data: locations = [], isLoading } = useInventoryLocations(companyId);
  const queryClient = useQueryClient();
  const run = useServerFn(manageInventoryLocation);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LocationRow | null>(null);
  const [draft, setDraft] = useState({ name: "", code: "", notes: "" });

  const mutation = useMutation({
    mutationFn: (input: {
      action: "create" | "update" | "activate" | "deactivate" | "set_default";
      locationId?: string;
      name?: string;
      code?: string;
      notes?: string;
    }) =>
      run({
        data: {
          companyId,
          action: input.action,
          locationId: input.locationId ?? null,
          name: input.name ?? null,
          code: input.code ?? null,
          notes: input.notes ?? null,
          isDefault: null,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: locationsQueryKey(companyId) });
      setOpen(false);
      setEditing(null);
      toast.success("Ubicazioni aggiornate");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const startCreate = () => {
    setEditing(null);
    setDraft({ name: "", code: "", notes: "" });
    setOpen(true);
  };

  const startEdit = (row: LocationRow) => {
    setEditing(row);
    setDraft({ name: row.name, code: row.code ?? "", notes: row.notes ?? "" });
    setOpen(true);
  };

  return (
    <section aria-labelledby="locations-title" className="rounded-lg border border-border p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="locations-title" className="text-sm font-semibold">
            Zone di magazzino
          </h2>
          <p className="text-xs text-muted-foreground">
            Chi usa una sola zona non deve configurare nulla: la zona predefinita è già pronta.
          </p>
        </div>
        {isAdmin ? (
          <Button type="button" size="sm" variant="outline" onClick={startCreate}>
            <Plus aria-hidden="true" />
            Aggiungi zona
          </Button>
        ) : null}
      </div>

      {isLoading ? <p className="mt-3 text-sm text-muted-foreground">Caricamento…</p> : null}

      <ul className="mt-3 divide-y divide-border">
        {locations.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{row.name}</span>
                {row.is_default ? (
                  <Badge variant="secondary">
                    <Star className="fill-current" aria-hidden="true" />
                    Predefinita
                  </Badge>
                ) : null}
                {row.status !== "attivo" ? <Badge variant="outline">Disattivata</Badge> : null}
              </div>
              {row.code || row.notes ? (
                <p className="truncate text-xs text-muted-foreground">
                  {[row.code, row.notes].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
            {isAdmin ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => startEdit(row)}>
                  Modifica
                </Button>
                {!row.is_default ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ action: "set_default", locationId: row.id })}
                  >
                    Rendi predefinita
                  </Button>
                ) : null}
                {!row.is_default ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        action: row.status === "attivo" ? "deactivate" : "activate",
                        locationId: row.id,
                      })
                    }
                  >
                    {row.status === "attivo" ? "Disattiva" : "Riattiva"}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
        {!isLoading && !locations.length ? (
          <li className="py-3 text-sm text-muted-foreground">Nessuna zona configurata.</li>
        ) : null}
      </ul>

      <Dialog open={open} onOpenChange={(value) => (value ? setOpen(true) : (setOpen(false), setEditing(null)))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica zona" : "Nuova zona di magazzino"}</DialogTitle>
            <DialogDescription>
              Il nome è libero: frigo, banco, cella, deposito o qualunque altra zona in cui tieni la merce.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm">
              Nome
              <Input
                className="mt-1"
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Frigo"
              />
            </label>
            <label className="block text-sm">
              Codice interno (facoltativo)
              <Input
                className="mt-1"
                value={draft.code}
                onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))}
              />
            </label>
            <label className="block text-sm">
              Note (facoltative)
              <Textarea
                className="mt-1"
                value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending || !draft.name.trim()}
              onClick={() =>
                mutation.mutate({
                  action: editing ? "update" : "create",
                  ...(editing ? { locationId: editing.id } : {}),
                  name: draft.name,
                  code: draft.code,
                  notes: draft.notes,
                })
              }
            >
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
