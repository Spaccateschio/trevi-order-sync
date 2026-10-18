import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

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
  MOCK_SECTIONS,
  MOCK_TEAM,
  type MockSection,
  type MockTeamMember,
} from "@/lib/platform-mock-data";

export const Route = createFileRoute("/piattaforma/team")({
  head: () => ({
    meta: [
      { title: "Team interno — Amministrazione piattaforma (mockup)" },
      {
        name: "description",
        content: "Utenti interni dell'amministrazione: per ciascuno i permessi sulle sezioni della piattaforma.",
      },
      { property: "og:title", content: "Team interno — Amministrazione piattaforma (mockup)" },
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

const PERMISSION_LABELS = {
  vedere: "Solo vedere",
  modificare: "Vedere e modificare",
  niente: "Nessun accesso",
} as const;

function PlatformTeam() {
  const [members, setMembers] = useState<MockTeamMember[]>(MOCK_TEAM);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  function handleAdd() {
    if (!name.trim() || !email.trim()) return;
    setMembers((prev) => [
      ...prev,
      {
        id: `t${prev.length + 1}`,
        name: name.trim(),
        email: email.trim(),
        addedAt: "Oggi",
        permissions: {
          pannello: "vedere",
          aziende: "niente",
          utenti: "niente",
          registro: "niente",
          assistenza: "niente",
          impostazioni: "niente",
        },
      },
    ]);
    setName("");
    setEmail("");
    setAddOpen(false);
  }

  function handleRemove(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  function handlePermission(id: string, section: MockSection, value: string) {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              permissions: {
                ...m.permissions,
                [section]: value as MockTeamMember["permissions"][MockSection],
              },
            }
          : m,
      ),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold">Team interno ({members.length})</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Aggiungi persona
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Solo il super amministratore può aggiungere o rimuovere persone del team interno. Per
        ciascuna decidi cosa può vedere e cosa può modificare. Il team interno non tocca mai i
        dati delle aziende clienti.
      </p>

      <ul className="space-y-3">
        {members.map((member) => (
          <li key={member.id}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
                <div className="min-w-0">
                  <CardTitle className="text-base">{member.name}</CardTitle>
                  <p className="truncate text-sm text-muted-foreground">
                    {member.email} · aggiunta il {member.addedAt}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(member.id)}
                  aria-label={`Rimuovi ${member.name}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {MOCK_SECTIONS.map((section) => (
                    <div key={section.key} className="flex items-center justify-between gap-2">
                      <Label className="text-sm font-normal">{section.label}</Label>
                      <Select
                        value={member.permissions[section.key]}
                        onValueChange={(v) => handlePermission(member.id, section.key, v)}
                      >
                        <SelectTrigger
                          className="w-44"
                          aria-label={`Permesso ${section.label} per ${member.name}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PERMISSION_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
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
              La persona riceverà un invito per accedere all'area di amministrazione. Potrai
              decidere i suoi permessi dopo averla aggiunta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="team-name">Nome e cognome</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es. Mario Rossi"
              />
            </div>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleAdd} disabled={!name.trim() || !email.trim()}>
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
