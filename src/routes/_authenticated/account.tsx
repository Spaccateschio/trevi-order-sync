import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { identityQueryKey, useIdentity } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account — Trevi Fruit" },
      { name: "description", content: "I tuoi dati personali di accesso a Trevi Fruit." },
      { property: "og:title", content: "Account — Trevi Fruit" },
      { property: "og:description", content: "I tuoi dati personali di accesso a Trevi Fruit." },
    ],
  }),
  component: Account,
});

function Account() {
  const { data: identity } = useIdentity();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFirstName(identity?.profile?.firstName ?? "");
    setLastName(identity?.profile?.lastName ?? "");
    setPhone(identity?.profile?.phone ?? "");
  }, [identity?.profile?.firstName, identity?.profile?.lastName, identity?.profile?.phone]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!identity?.userId) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ first_name: firstName, last_name: lastName, phone })
      .eq("user_id", identity.userId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Dati aggiornati");
    queryClient.invalidateQueries({ queryKey: identityQueryKey });
  }

  return (
    <AppShell title="Account" description="I dati della persona che accede.">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:max-w-xl">
        <p className="text-sm text-muted-foreground">
          Email di accesso: <span className="text-foreground">{identity?.email}</span>
        </p>
        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">Nome</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Cognome</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefono</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy}>
            Salva
          </Button>
        </form>
      </section>
    </AppShell>
  );
}
