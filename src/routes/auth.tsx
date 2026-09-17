import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { validatePhone } from "@/lib/phone";

type Modo = "accesso" | "registrazione";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (
    search: Record<string, unknown>,
  ): { modo?: Modo | undefined; invito?: string | undefined } => ({
    modo: search["modo"] === "registrazione" ? "registrazione" : undefined,
    invito: typeof search["invito"] === "string" ? search["invito"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Accedi a Trevi Fruit" },
      {
        name: "description",
        content: "Accedi o registrati per usare il portale Trevi Fruit.",
      },
      { property: "og:title", content: "Accedi a Trevi Fruit" },
      {
        property: "og:description",
        content: "Accedi o registrati per usare il portale Trevi Fruit.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { modo, invito } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Modo>(modo === "registrazione" ? "registrazione" : "accesso");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // L'invito arriva dal link ricevuto: dopo l'accesso torniamo esattamente lì.
  const inviteToken = invito ?? readInviteToken();

  useEffect(() => {
    if (invito) rememberInviteToken(invito);
  }, [invito]);

  function afterAuth() {
    if (inviteToken) {
      navigate({ to: "/invito/$token", params: { token: inviteToken }, replace: true });
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) afterAuth();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    let normalizedPhone = "";
    if (mode === "registrazione") {
      if (!firstName.trim() || !lastName.trim()) {
        toast.error("Inserisci nome e cognome");
        return;
      }
      const checked = validatePhone(phone);
      if ("error" in checked) {
        toast.error(checked.error);
        return;
      }
      normalizedPhone = checked.value;
      if (password !== passwordConfirm) {
        toast.error("Le due password non coincidono");
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "registrazione") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: inviteToken ? inviteUrl(inviteToken) : window.location.origin,
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              phone: normalizedPhone,
            },
          },
        });
        if (error) throw error;
        setSentTo(email);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        afterAuth();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Operazione non riuscita";
      toast.error(
        message === "Invalid login credentials"
          ? "Email o password non corretti"
          : message === "Email not confirmed"
            ? "Devi prima confermare l'email che ti abbiamo inviato"
            : message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      toast.error("Inserisci la tua email, poi riprova");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Ti abbiamo inviato il link per reimpostare la password");
  }

  return (
    <div className="flex min-h-screen flex-col bg-sidebar px-4 py-6 sm:px-6">
      <Link to="/" className="self-start">
        <BrandMark tone="dark" />
      </Link>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-lg sm:p-8">
          {sentTo ? (
            <div className="text-center">
              <h1 className="font-display text-xl font-semibold">Controlla la tua email</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Abbiamo inviato un link di conferma a <strong>{sentTo}</strong>. Conferma
                l'indirizzo per attivare l'accesso.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                La conferma dell'email attiva il tuo accesso personale. L'abilitazione a vedere
                prezzi e ordinare viene autorizzata separatamente da Trevi Fruit.
              </p>
              <Button
                variant="outline"
                className="mt-5 w-full"
                onClick={() => {
                  setSentTo(null);
                  setMode("accesso");
                }}
              >
                Torna all'accesso
              </Button>
            </div>
          ) : (
            <>
              <h1 className="font-display text-xl font-semibold">
                {mode === "accesso" ? "Accedi" : "Crea il tuo accesso"}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {mode === "accesso"
                  ? "Entra con la tua email e password."
                  : "Registri la persona che accede. I dati dell'attività si completano dopo."}
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {mode === "registrazione" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                     <div className="space-y-1.5">
                      <Label htmlFor="firstName">Nome</Label>
                      <Input
                        id="firstName"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        autoComplete="given-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lastName">Cognome</Label>
                      <Input
                        id="lastName"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        autoComplete="family-name"
                      />
                    </div>
                  </div>
                ) : null}

                {mode === "registrazione" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Cellulare</Label>
                    <Input
                      id="phone"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder="+39 333 1234567"
                      maxLength={24}
                    />
                    <p className="text-xs text-muted-foreground">
                      Indica il prefisso internazionale se il numero non è italiano.
                    </p>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "accesso" ? "current-password" : "new-password"}
                  />
                </div>

                {mode === "registrazione" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="passwordConfirm">Conferma password</Label>
                    <Input
                      id="passwordConfirm"
                      type="password"
                      required
                      minLength={8}
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                ) : null}

                <Button type="submit" className="w-full" size="lg" disabled={busy}>
                  {mode === "accesso" ? "Accedi" : "Registrati"}
                </Button>
              </form>

              <div className="mt-5 space-y-2 text-center text-sm">
                {mode === "accesso" ? (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-muted-foreground underline-offset-4 hover:underline"
                    disabled={busy}
                  >
                    Password dimenticata?
                  </button>
                ) : null}
                <p className="text-muted-foreground">
                  {mode === "accesso" ? "Non hai un accesso?" : "Hai già un accesso?"}{" "}
                  <button
                    type="button"
                    onClick={() => setMode(mode === "accesso" ? "registrazione" : "accesso")}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {mode === "accesso" ? "Registrati" : "Accedi"}
                  </button>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
