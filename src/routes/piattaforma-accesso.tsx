import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getPlatformAccess } from "@/lib/platform.functions";

export const Route = createFileRoute("/piattaforma-accesso")({
  head: () => ({
    meta: [
      { title: "Accesso amministrazione — Trevi Fruit" },
      {
        name: "description",
        content: "Accesso riservato all'area di amministrazione della piattaforma.",
      },
      { property: "og:title", content: "Accesso amministrazione — Trevi Fruit" },
      {
        property: "og:description",
        content: "Accesso riservato all'area di amministrazione della piattaforma.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformLogin,
});

function PlatformLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  async function handleForgotPassword() {
    if (sendingReset) return;
    if (!email) {
      toast.error("Inserisci la tua email, poi riprova");
      return;
    }
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Ti abbiamo inviato il link per reimpostare la password");
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error("Email o password non corretti");
        return;
      }
      const access = await getPlatformAccess();
      if (!access.isAdmin) {
        await supabase.auth.signOut();
        toast.error("Questo account non fa parte del team interno");
        return;
      }
      navigate({ to: "/piattaforma", replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <ShieldCheck className="h-10 w-10 text-primary" aria-hidden />
          <CardTitle className="font-display text-xl">Amministrazione piattaforma</CardTitle>
          <p className="text-sm text-muted-foreground">
            Accesso riservato al team interno di Trevi Fruit
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@piattaforma.it"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="admin-password">Password</Label>
              <PasswordInput
                id="admin-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Accesso in corso…" : "Entra"}
            </Button>
          </form>
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={sendingReset}
            className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline disabled:opacity-70"
          >
            {sendingReset ? "Invio in corso…" : "Password dimenticata?"}
          </button>
        </CardContent>

      </Card>
    </div>
  );
}
