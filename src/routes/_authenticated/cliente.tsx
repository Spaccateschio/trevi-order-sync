import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, PlaceholderCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { identityQueryKey, useIdentity } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/cliente")({
  head: () => ({
    meta: [
      { title: "Area cliente — Trevi Fruit" },
      {
        name: "description",
        content: "Area cliente di Trevi Fruit: dati della tua attività e stato del collegamento.",
      },
      { property: "og:title", content: "Area cliente — Trevi Fruit" },
      {
        property: "og:description",
        content: "Area cliente di Trevi Fruit: dati della tua attività e stato del collegamento.",
      },
    ],
  }),
  component: AreaCliente,
});

const RELATION_LABEL: Record<string, string> = {
  in_attesa: "In attesa di approvazione da Trevi Fruit",
  attivo: "Attivo",
  sospeso: "Sospeso",
  revocato: "Revocato",
  rifiutato: "Rifiutato",
};

function AreaCliente() {
  const { data: identity, isLoading } = useIdentity();
  const queryClient = useQueryClient();
  const [legalName, setLegalName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);

  const link = identity?.customerLinks[0];
  const relations = identity?.relations.filter(
    (r) => r.customerCompanyId === link?.customerCompanyId,
  );

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("register_customer_company", {
      _legal_name: legalName,
      _vat_number: vatNumber,
      _phone: phone,
      _city: city,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Attività registrata. La richiesta di collegamento è in attesa di approvazione.");
    queryClient.invalidateQueries({ queryKey: identityQueryKey });
  }

  return (
    <AppShell title="Area cliente" description="La tua attività e lo stato del collegamento.">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : link ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-display text-base font-semibold">{link.customerCompanyName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Il tuo ruolo: {link.role === "owner" ? "Titolare" : "Utente"}
            </p>
            <div className="mt-3 space-y-1">
              {relations?.length ? (
                relations.map((r) => (
                  <p key={r.id} className="text-sm">
                    <span className="text-muted-foreground">
                      {r.companyName ?? "Fornitore"}:{" "}
                    </span>
                    {RELATION_LABEL[r.status] ?? r.status}
                  </p>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nessun collegamento registrato.</p>
              )}
            </div>
          </section>
          <PlaceholderCard
            title="In arrivo nelle prossime fasi"
            items={[
              "Catalogo con i tuoi prezzi",
              "Carrello e invio ordine",
              "Storico e stato degli ordini",
            ]}
          />
        </div>
      ) : (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:max-w-xl">
          <h2 className="font-display text-base font-semibold">Registra la tua attività</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Inserisci i dati dell'attività. La richiesta di collegamento resta in attesa fino
            all'approvazione di Trevi Fruit.
          </p>
          <form onSubmit={handleRegister} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="legalName">Ragione sociale</Label>
              <Input
                id="legalName"
                required
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="vatNumber">P.IVA</Label>
                <Input
                  id="vatNumber"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefono</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Città</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy}>
              Invia richiesta
            </Button>
          </form>
        </section>
      )}
    </AppShell>
  );
}
