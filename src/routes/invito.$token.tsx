import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { activeCompany, hasRole, identityQueryKey, useIdentity } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";
import { forgetInviteToken, rememberInviteToken } from "@/lib/invite-token";

export const Route = createFileRoute("/invito/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Invito di collegamento — Trevi Fruit" },
      {
        name: "description",
        content:
          "Accetta l'invito del tuo fornitore: i dati aziendali che conosce già sono pronti, tu li confermi o li correggi.",
      },
      { property: "og:title", content: "Invito di collegamento — Trevi Fruit" },
      {
        property: "og:description",
        content: "Accetta l'invito del tuo fornitore e collega la tua azienda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvitoPage,
});

type Preview = {
  invitation_id: string;
  seller_company_id: string;
  seller_company_name: string;
  customer_record_id: string | null;
  customer_legal_name: string | null;
  customer_vat_number: string | null;
  customer_vat_normalized: string | null;
  customer_tax_code: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address_line: string | null;
  customer_postal_code: string | null;
  customer_city: string | null;
  customer_province: string | null;
  customer_delivery_address_line: string | null;
  customer_delivery_postal_code: string | null;
  customer_delivery_city: string | null;
  customer_delivery_province: string | null;
  customer_delivery_notes: string | null;
  email: string;
  status: "in_attesa" | "accettato" | "annullato" | "annullato_scaduto";
  expired: boolean;
  company_exists_for_vat: boolean;
  vat_mismatch: boolean;
};

function maskVat(vat: string | null) {
  if (!vat) return "non indicata";
  return vat.length > 4 ? `${"•".repeat(vat.length - 4)}${vat.slice(-4)}` : vat;
}

function InvitoPage() {
  const { token } = Route.useParams();
  const { data: identity, isLoading: identityLoading } = useIdentity();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    rememberInviteToken(token);
  }, [token]);

  const previewQuery = useQuery({
    queryKey: ["invitation-preview", token],
    queryFn: async (): Promise<Preview | null> => {
      const { data, error } = await supabase.rpc("invitation_preview", { _token: token });
      if (error) throw error;
      return ((data ?? []) as Preview[])[0] ?? null;
    },
  });

  const preview = previewQuery.data ?? null;

  useEffect(() => {
    if (!preview) return;
    setForm({
      legalName: preview.customer_legal_name ?? "",
      vatNumber: preview.customer_vat_number ?? "",
      taxCode: preview.customer_tax_code ?? "",
      email: preview.customer_email ?? preview.email ?? "",
      phone: preview.customer_phone ?? "",
      addressLine: preview.customer_address_line ?? "",
      postalCode: preview.customer_postal_code ?? "",
      city: preview.customer_city ?? "",
      province: preview.customer_province ?? "",
      deliveryAddressLine: preview.customer_delivery_address_line ?? "",
      deliveryPostalCode: preview.customer_delivery_postal_code ?? "",
      deliveryCity: preview.customer_delivery_city ?? "",
      deliveryProvince: preview.customer_delivery_province ?? "",
      deliveryNotes: preview.customer_delivery_notes ?? "",
    });
  }, [preview]);

  const signedIn = Boolean(identity);
  const company = activeCompany(identity);
  const isAdmin = hasRole(identity, "amministratore");

  async function acceptWithExistingCompany() {
    if (!company) return;
    setBusy(true);
    const { error } = await supabase.rpc("accept_customer_invitation", {
      _token: token,
      _buyer_company_id: company.companyId,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    forgetInviteToken();
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    toast.success("Collegamento attivo.");
    await navigate({ to: "/acquisti/fornitori" });
  }

  async function confirmAndCreateCompany() {
    if (!form.legalName.trim()) {
      toast.error("Indica la ragione sociale della tua azienda");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("accept_invitation_with_new_company", {
      _token: token,
      _legal_name: form.legalName,
      _can_buy: true,
      _can_sell: false,
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
    forgetInviteToken();
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    toast.success("Azienda creata e collegata al fornitore.");
    await navigate({ to: "/acquisti/fornitori" });
  }

  return (
    <div className="min-h-screen bg-sidebar px-4 py-6 sm:px-6">
      <BrandMark tone="dark" />
      <div className="mx-auto mt-8 w-full max-w-2xl">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-lg sm:p-8">
          {previewQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento…</p>
          ) : !preview ? (
            <>
              <h1 className="font-display text-xl font-semibold">Invito non valido</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Questo invito non è più utilizzabile. Chiedi al fornitore di inviartene uno nuovo.
              </p>
            </>
          ) : preview.status !== "in_attesa" || preview.expired ? (
            <>
              <h1 className="font-display text-xl font-semibold">Invito non più utilizzabile</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {preview.expired
                  ? "L'invito è scaduto: chiedi al fornitore di reinviarlo."
                  : "L'invito è già stato usato o annullato: chiedi al fornitore di reinviarlo."}
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-xl font-semibold">
                {preview.seller_company_name} ti invita su Trevi Fruit
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Il collegamento nasce solo dopo la tua conferma esplicita.
              </p>

              {!signedIn && !identityLoading ? (
                <div className="mt-6 space-y-3">
                  <p className="text-sm">
                    Per continuare crea il tuo accesso personale o entra con quello che hai già:
                    torneremo automaticamente su questo invito.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() =>
                        navigate({ to: "/auth", search: { modo: "registrazione", invito: token } })
                      }
                    >
                      Crea il tuo accesso
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => navigate({ to: "/auth", search: { invito: token } })}
                    >
                      Ho già un accesso
                    </Button>
                  </div>
                </div>
              ) : company ? (
                <div className="mt-6 space-y-3">
                  <p className="text-sm">L'invito è destinato a:</p>
                  <div className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-medium">
                      {preview.customer_legal_name ?? preview.seller_company_name}
                    </p>
                    <p className="text-muted-foreground">
                      P.IVA {maskVat(preview.customer_vat_normalized)}
                    </p>
                  </div>
                  {preview.vat_mismatch ? (
                    <p className="text-sm text-muted-foreground">
                      La partita IVA della tua azienda non corrisponde a quella indicata dal
                      fornitore: il collegamento deve essere verificato da lui. Contattalo prima di
                      procedere.
                    </p>
                  ) : !isAdmin ? (
                    <p className="text-sm text-muted-foreground">
                      Solo un amministratore della tua azienda può accettare l'invito.
                    </p>
                  ) : (
                    <Button disabled={busy} onClick={acceptWithExistingCompany}>
                      Collega {company.companyName} a {preview.seller_company_name}
                    </Button>
                  )}
                </div>
              ) : preview.company_exists_for_vat ? (
                <div className="mt-6 space-y-3">
                  <p className="text-sm">
                    Esiste già un'azienda registrata con la partita IVA{" "}
                    {maskVat(preview.customer_vat_normalized)}. Per motivi di sicurezza non ne
                    creiamo una seconda: chiedi al suo amministratore di aggiungerti, poi torna su
                    questo invito.
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  <div>
                    <h2 className="font-display text-base font-semibold">
                      Dati aziendali associati al tuo invito
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Sono i dati che il fornitore conosce. Controllali: puoi correggerli o
                      completarli prima di confermare. La sua anagrafica non viene modificata.
                    </p>
                  </div>

                  {editing ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <F
                        label="Ragione sociale"
                        value={form.legalName}
                        onChange={(v) => setForm({ ...form, legalName: v })}
                        className="sm:col-span-2"
                      />
                      <F
                        label="Partita IVA"
                        value={form.vatNumber}
                        onChange={(v) => setForm({ ...form, vatNumber: v })}
                      />
                      <F
                        label="Codice fiscale"
                        value={form.taxCode}
                        onChange={(v) => setForm({ ...form, taxCode: v })}
                      />
                      <F
                        label="Email"
                        value={form.email}
                        onChange={(v) => setForm({ ...form, email: v })}
                      />
                      <F
                        label="Telefono"
                        value={form.phone}
                        onChange={(v) => setForm({ ...form, phone: v })}
                      />
                      <F
                        label="Indirizzo"
                        value={form.addressLine}
                        onChange={(v) => setForm({ ...form, addressLine: v })}
                        className="sm:col-span-2"
                      />
                      <F
                        label="CAP"
                        value={form.postalCode}
                        onChange={(v) => setForm({ ...form, postalCode: v })}
                      />
                      <F
                        label="Città"
                        value={form.city}
                        onChange={(v) => setForm({ ...form, city: v })}
                      />
                      <F
                        label="Provincia"
                        value={form.province}
                        onChange={(v) => setForm({ ...form, province: v })}
                      />
                      <F
                        label="Indirizzo di consegna"
                        value={form.deliveryAddressLine}
                        onChange={(v) => setForm({ ...form, deliveryAddressLine: v })}
                        className="sm:col-span-2"
                      />
                      <F
                        label="CAP consegna"
                        value={form.deliveryPostalCode}
                        onChange={(v) => setForm({ ...form, deliveryPostalCode: v })}
                      />
                      <F
                        label="Città consegna"
                        value={form.deliveryCity}
                        onChange={(v) => setForm({ ...form, deliveryCity: v })}
                      />
                      <F
                        label="Provincia consegna"
                        value={form.deliveryProvince}
                        onChange={(v) => setForm({ ...form, deliveryProvince: v })}
                      />
                      <div className="grid gap-1.5 sm:col-span-2">
                        <Label htmlFor="inv-delivery-notes">Note per la consegna</Label>
                        <Textarea
                          id="inv-delivery-notes"
                          value={form.deliveryNotes}
                          onChange={(e) => setForm({ ...form, deliveryNotes: e.target.value })}
                        />
                      </div>
                    </div>
                  ) : (
                    <dl className="grid gap-2 rounded-lg border border-border p-3 text-sm sm:grid-cols-2">
                      <Row label="Ragione sociale" value={form.legalName} />
                      <Row label="Partita IVA" value={form.vatNumber} />
                      <Row label="Codice fiscale" value={form.taxCode} />
                      <Row label="Email" value={form.email} />
                      <Row label="Telefono" value={form.phone} />
                      <Row
                        label="Indirizzo"
                        value={[form.addressLine, form.postalCode, form.city, form.province]
                          .filter(Boolean)
                          .join(" ")}
                      />
                      <Row
                        label="Consegna"
                        value={[
                          form.deliveryAddressLine,
                          form.deliveryPostalCode,
                          form.deliveryCity,
                          form.deliveryProvince,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      />
                    </dl>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button disabled={busy} onClick={confirmAndCreateCompany}>
                      Confermo i dati
                    </Button>
                    <Button variant="outline" onClick={() => setEditing((v) => !v)}>
                      {editing ? "Torna al riepilogo" : "Modifica / Completa"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Confermando crei la tua azienda su Trevi Fruit e attivi il collegamento con{" "}
                    {preview.seller_company_name}. Nessun altro fornitore ottiene accesso.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </div>
  );
}

function F({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const id = `inv-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
