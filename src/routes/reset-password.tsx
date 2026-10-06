import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nuova password — Trevi Fruit" },
      { name: "description", content: "Imposta una nuova password per il tuo accesso Trevi Fruit." },
      { property: "og:title", content: "Nuova password — Trevi Fruit" },
      {
        property: "og:description",
        content: "Imposta una nuova password per il tuo accesso Trevi Fruit.",
      },
    ],
  }),
  component: ResetPassword,
});

type LinkState = "checking" | "ready" | "invalid";

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkState, setLinkState] = useState<LinkState>("checking");

  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) {
        setLinkState("ready");
      }
    });

    async function init() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);

      // Link già usato o scaduto: la sessione di recupero non esiste.
      if (hash.get("error") || query.get("error")) {
        const { data } = await supabase.auth.getSession();
        if (!cancelled) setLinkState(data.session ? "ready" : "invalid");
        return;
      }

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        window.history.replaceState(null, "", window.location.pathname);
        if (!cancelled) setLinkState(error ? "invalid" : "ready");
        return;
      }

      const code = query.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        window.history.replaceState(null, "", window.location.pathname);
        if (!cancelled) setLinkState(error ? "invalid" : "ready");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!cancelled) setLinkState(data.session ? "ready" : "invalid");
    }

    void init();
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      toast.error("Le due password non coincidono");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      if (/session/i.test(error.message)) {
        setLinkState("invalid");
        toast.error("Il link non è più valido: richiedine uno nuovo");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Password aggiornata");
    navigate({ to: "/dashboard", replace: true });
  }

  if (linkState !== "ready") {
    return (
      <div className="flex min-h-screen flex-col bg-sidebar px-4 py-6 sm:px-6">
        <BrandMark tone="dark" />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
          <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-lg sm:p-8">
            {linkState === "checking" ? (
              <p className="text-sm text-muted-foreground">Verifica del link in corso…</p>
            ) : (
              <>
                <h1 className="font-display text-xl font-semibold">Link scaduto o già usato</h1>
                <p className="mt-3 text-sm text-muted-foreground">
                  Ogni link per reimpostare la password funziona una sola volta. Torna
                  all'accesso, inserisci la tua email e premi di nuovo «Password dimenticata»,
                  poi apri soltanto l'ultima email ricevuta.
                </p>
                <Button
                  className="mt-6 w-full"
                  size="lg"
                  onClick={() => navigate({ to: "/auth", replace: true })}
                >
                  Torna all'accesso
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-sidebar px-4 py-6 sm:px-6">
      <BrandMark tone="dark" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-lg sm:p-8">
          <h1 className="font-display text-xl font-semibold">Imposta una nuova password</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Scegli una password di almeno 8 caratteri.
          </p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">Nuova password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Ripeti la password</Label>
              <Input
                id="confirm"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              Salva password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
