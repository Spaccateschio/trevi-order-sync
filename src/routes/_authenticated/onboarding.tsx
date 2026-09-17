import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { hasCompany, identityQueryKey, useIdentity } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Come userai Trevi Fruit?" },
      {
        name: "description",
        content:
          "Scegli se acquisti dai tuoi fornitori, vendi ai tuoi clienti o entrambe le cose, e completa i dati della tua azienda.",
      },
      { property: "og:title", content: "Come userai Trevi Fruit?" },
      {
        property: "og:description",
        content:
          "Scegli se acquisti dai tuoi fornitori, vendi ai tuoi clienti o entrambe le cose, e completa i dati della tua azienda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Onboarding,
});

type Profilo = "compro" | "vendo" | "entrambi";

const PROFILI: { value: Profilo; title: string; description: string }[] = [
  {
    value: "compro",
    title: "COMPRO",
    description: "Acquisto prodotti dai miei fornitori.",
  },
  {
    value: "vendo",
    title: "VENDO",
    description: "Vendo prodotti ai miei clienti.",
  },
  {
    value: "entrambi",
    title: "COMPRO E VENDO",
    description: "Acquisto dai miei fornitori e vendo ai miei clienti.",
  },
];

function Onboarding() {
  const { data: identity, isLoading } = useIdentity();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [profilo, setProfilo] = useState<Profilo | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    legalName: "",
    vatNumber: "",
    taxCode: "",
    email: "",
    phone: "",
    addressLine: "",
    postalCode: "",
    city: "",
    province: "",
    deliveryAddressLine: "",
    deliveryPostalCode: "",
    deliveryCity: "",
    deliveryProvince: "",
    deliveryNotes: "",
  });

  useEffect(() => {
    if (!isLoading && hasCompany(identity)) navigate({ to: "/dashboard", replace: true });
  }, [identity, isLoading, navigate]);

  const buys = profilo === "compro" || profilo === "entrambi";
  const sells = profilo === "vendo" || profilo === "entrambi";

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!profilo) return;
    setBusy(true);
    const { error } = await supabase.rpc("register_company", {
      _legal_name: form.legalName,
      _can_buy: buys,
      _can_sell: sells,
      _vat_number: form.vatNumber,
      _tax_code: form.taxCode,
      _email: form.email,
      _phone: form.phone,
      _address_line: form.addressLine,
      _postal_code: form.postalCode,
      _city: form.city,
      _province: form.province,
      _delivery_address_line: form.deliveryAddressLine,
      _delivery_postal_code: form.deliveryPostalCode,
      _delivery_city: form.deliveryCity,
      _delivery_province: form.deliveryProvince,
      _delivery_notes: form.deliveryNotes,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    toast.success("Azienda registrata.");
    navigate({ to: buys ? "/acquisti/fornitori" : "/vendite", replace: true });
  }

  return (
    <div className="min-h-screen bg-sidebar px-4 py-6 sm:px-6">
      <BrandMark tone="dark" />
      <div className="mx-auto mt-8 w-full max-w-2xl">
        {step === 1 ? (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-lg sm:p-8">
            <h1 className="font-display text-xl font-semibold">Come userai Trevi Fruit?</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Puoi cambiare questa scelta in seguito dalle impostazioni dell'azienda.
            </p>
            <div className="mt-6 grid gap-3">
              {PROFILI.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setProfilo(option.value)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors",
                    profilo === option.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <span className="font-display text-base font-semibold">{option.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
            <Button
              className="mt-6 w-full"
              size="lg"
              disabled={!profilo}
              onClick={() => setStep(2)}
            >
              Continua
            </Button>
          </section>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-border bg-card p-6 shadow-lg sm:p-8"
          >
            <h1 className="font-display text-xl font-semibold">Dati della tua azienda</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Profilo scelto: {PROFILI.find((p) => p.value === profilo)?.title}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Registrare l'azienda non ti collega a nessun fornitore: dopo potrai richiedere il
              collegamento e sarà il fornitore ad approvarlo.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="legalName">Ragione sociale</Label>
                <Input
                  id="legalName"
                  required
                  value={form.legalName}
                  onChange={(e) => set("legalName", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vatNumber">Partita IVA</Label>
                <Input
                  id="vatNumber"
                  value={form.vatNumber}
                  onChange={(e) => set("vatNumber", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="taxCode">Codice fiscale</Label>
                <Input
                  id="taxCode"
                  value={form.taxCode}
                  onChange={(e) => set("taxCode", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="companyEmail">Email aziendale</Label>
                <Input
                  id="companyEmail"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="companyPhone">Telefono</Label>
                <Input
                  id="companyPhone"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  inputMode="tel"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="addressLine">Indirizzo</Label>
                <Input
                  id="addressLine"
                  value={form.addressLine}
                  onChange={(e) => set("addressLine", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="postalCode">CAP</Label>
                <Input
                  id="postalCode"
                  value={form.postalCode}
                  onChange={(e) => set("postalCode", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="city">Città</Label>
                  <Input id="city" value={form.city} onChange={(e) => set("city", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="province">Prov.</Label>
                  <Input
                    id="province"
                    maxLength={2}
                    value={form.province}
                    onChange={(e) => set("province", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {buys ? (
              <div className="mt-6 border-t border-border pt-5">
                <h2 className="font-display text-base font-semibold">Indirizzo di consegna</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Compilalo se la merce arriva a un indirizzo diverso dalla sede.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="deliveryAddressLine">Indirizzo</Label>
                    <Input
                      id="deliveryAddressLine"
                      value={form.deliveryAddressLine}
                      onChange={(e) => set("deliveryAddressLine", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="deliveryPostalCode">CAP</Label>
                    <Input
                      id="deliveryPostalCode"
                      value={form.deliveryPostalCode}
                      onChange={(e) => set("deliveryPostalCode", e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="deliveryCity">Città</Label>
                      <Input
                        id="deliveryCity"
                        value={form.deliveryCity}
                        onChange={(e) => set("deliveryCity", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="deliveryProvince">Prov.</Label>
                      <Input
                        id="deliveryProvince"
                        maxLength={2}
                        value={form.deliveryProvince}
                        onChange={(e) => set("deliveryProvince", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="deliveryNotes">Note per la consegna</Label>
                    <Textarea
                      id="deliveryNotes"
                      value={form.deliveryNotes}
                      onChange={(e) => set("deliveryNotes", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={busy}>
                Indietro
              </Button>
              <Button type="submit" className="flex-1" size="lg" disabled={busy}>
                Registra l'azienda
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
