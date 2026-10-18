import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  findPlatformUserByEmail,
  getPlatformAccess,
  listPlatformTeam,
  managePlatformTeamMember,
  type PlatformPermission,
  type PlatformSection,
} from "@/lib/platform.functions";

export const Route = createFileRoute("/piattaforma/team")({
  head: () => ({
    meta: [
      { title: "Team interno — Amministrazione piattaforma" },
      {
        name: "description",
        content: "Utenti interni dell'amministrazione: per ciascuno i permessi sulle sezioni della piattaforma.",
      },
      { property: "og:title", content: "Team interno — Amministrazione piattaforma" },
      {
        property: "og:description",
        content: "Utenti interni dell'amministrazione: per ciascuno i permessi sulle sezioni della piattaforma.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformTeam,
});

const SECTIONS: { key: PlatformSection; label: string }[] = [
  { key: "aziende", label: "Aziende" },
  { key: "utenti", label: "Utenti" },
  { key: "registro", label: "Registro eventi" },
  { key: "assistenza", label: "Assistenza" },
  { key: "impostazioni", label: "Impostazioni" },
];

const PERMISSION_LABELS: Record<PlatformPermission, string> = {
  vedi: "Solo vedere",
  modifica: "Vedere e modificare",
  nessuno: "Nessun accesso",
};

const PERM_FIELD: Record<PlatformSection, string> = {
  aziende: "perm_aziende",
  utenti: "perm_utenti",
  registro: "perm_registro",
  assistenza: "perm_assistenza",
  impostazioni: "perm_impostazioni",
};

function PlatformTeam() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");

  const { data: access } = useQuery({
    queryKey: ["platform-access"],
    queryFn: () => getPlatformAccess(),
  });
  const { data: members, isLoading } = useQuery({
    queryKey: ["platform-team"],
    queryFn: () => listPlatformTeam(),
  });

  const addMutation = useMutation({
    mutationFn: async (rawEmail: string) => {
      const found = await findPlatformUserByEmail({ data: { email: rawEmail } });
      if (!found) {
        throw new Error(
          "Nessun utente registrato con questa email. La persona deve prima registrarsi all'app.",
        );
      }
      await managePlatformTeamMember({ data: { action: "aggiungi", userId: found.userId } });
      return found;
    },
    onSuccess: (found) => {
      toast.success(`${found.name || found.email} aggiunto al team interno`);
      setEmail("");
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["platform-team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const permMutation = useMutation({
    mutationFn: (input: {
      memberId: string;
      section: PlatformSection;
      value: PlatformPermission;
    }) =>
      managePlatformTeamMember({
        data: {
          action: "modifica",
          memberId: input.memberId,
          ...(input.section === "aziende" ? { permAziende: input.value } : {}),
          ...(input.section === "utenti" ? { permUtenti: input.value } : {}),
          ...(input.section === "registro" ? { permRegistro: input.value } : {}),
          ...(input.section === "assistenza" ? { permAssistenza: input.value } : {}),
          ...(input.section === "impostazioni" ? { permImpostazioni: input.value } : {}),
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-team"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) =>
      managePlatformTeamMember({ data: { action: "disattiva", memberId } }),
    onSuccess: () => {
      toast.success("Persona rimossa dal team interno");
      queryClient.invalidateQueries({ queryKey: ["platform-team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !members || !access) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Caricamento" />
      </div>
    );
  }

  const active = members.filter((m) => m.status === "attivo");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold">Team interno ({active.length})</h1>
        {access.isSuper && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Aggiungi persona
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Solo il super amministratore può aggiungere o rimuovere persone del team interno. Per
        ciascuna decidi cosa può vedere e cosa può modificare. Il team interno non tocca mai i
        dati delle aziende clienti.
      </p>

      <ul className="space-y-3">
        {active.map((member) => (
          <li key={member.id}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{member.name}</CardTitle>
                    {member.is_super && <Badge>Super amministratore</Badge>}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {member.email} · aggiunta il{" "}
                    {new Date(member.created_at).toLocaleDateString("it-IT")}
                  </p>
                </div>
                {access.isSuper && !member.is_super && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMutation.mutate(member.id)}
                    aria-label={`Rimuovi ${member.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {member.is_super ? (
                  <p className="text-sm text-muted-foreground">
                    Ha accesso completo a tutte le sezioni.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {SECTIONS.map((section) => {
                      const field = PERM_FIELD[section.key] as keyof typeof member;
                      const value = member[field] as PlatformPermission;
                      return (
                        <div key={section.key} className="flex items-center justify-between gap-2">
                          <Label className="text-sm font-normal">{section.label}</Label>
                          <Select
                            value={value}
                            disabled={!access.isSuper}
                            onValueChange={(v) =>
                              permMutation.mutate({
                                memberId: member.id,
                                section: section.key,
                                value: v as PlatformPermission,
                              })
                            }
                          >
                            <SelectTrigger
                              className="w-44"
                              aria-label={`Permesso ${section.label} per ${member.name}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(PERMISSION_LABELS).map(([val, label]) => (
                                <SelectItem key={val} value={val}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi persona al team</DialogTitle>
            <DialogDescription>
              Inserisci l'email di una persona già registrata all'app. Potrai decidere i suoi
              permessi dopo averla aggiunta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="team-email">Email</Label>
            <Input
              id="team-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@esempio.it"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={() => addMutation.mutate(email)}
              disabled={!email.trim() || addMutation.isPending}
            >
              {addMutation.isPending ? "Aggiunta in corso…" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
