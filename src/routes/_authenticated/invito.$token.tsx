import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { activeCompany, hasRole, identityQueryKey, useIdentity } from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/invito/$token")({
  head: () => ({
    meta: [
      { title: "Invito di collegamento — Trevi Fruit" },
      {
        name: "description",
        content:
          "Accetta l'invito di un fornitore per collegare la tua azienda e iniziare a lavorare insieme.",
      },
      { property: "og:title", content: "Invito di collegamento — Trevi Fruit" },
      {
        property: "og:description",
        content: "Accetta l'invito di un fornitore per collegare la tua azienda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvitoPage,
});

type Preview = {
  invitation_id: string;
  seller_company_name: string;
  customer_legal_name: string | null;
  customer_vat_normalized: string | null;
  email: string;
  status: "in_attesa" | "accettato" | "annullato" | "annullato_scaduto";
  expired: boolean;
};

function InvitoPage() {
  const { token } = Route.useParams();
  const { data: identity } = useIdentity();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const company = activeCompany(identity);
  const isAdmin = hasRole(identity, "amministratore");

  const previewQuery = useQuery({
    queryKey: ["invitation-preview", token],
    queryFn: async (): Promise<Preview | null> => {
      const { data, error } = await supabase.rpc("invitation_preview", { _token: token });
      if (error) throw error;
      return ((data ?? []) as Preview[])[0] ?? null;
    },
  });

  async function accept() {
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
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    toast.success("Collegamento attivo.");
    await navigate({ to: "/acquisti/fornitori" });
  }

  const preview = previewQuery.data;

  return (
    <AppShell
      title="Invito di collegamento"
      description="Il collegamento nasce solo dopo la tua accettazione esplicita."
    >
      {previewQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : !preview ? (
        <p className="text-sm text-muted-foreground">
          Questo invito non è valido. Chiedi al fornitore di inviartene uno nuovo.
        </p>
      ) : (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="font-display text-base font-semibold">{preview.seller_company_name}</h2>
          <p className="text-sm text-muted-foreground">
            Ti propone di collegare la vostra azienda come cliente
            {preview.customer_legal_name ? ` (scheda: ${preview.customer_legal_name})` : ""}.
          </p>
          {preview.status !== "in_attesa" ? (
            <p className="text-sm text-muted-foreground">
              Invito non più utilizzabile: chiedi al fornitore di reinviarlo.
            </p>
          ) : preview.expired ? (
            <p className="text-sm text-muted-foreground">
              Invito scaduto: chiedi al fornitore di reinviarlo.
            </p>
          ) : !company ? (
            <p className="text-sm text-muted-foreground">
              Completa prima i dati della tua azienda, poi torna su questo indirizzo.
            </p>
          ) : !isAdmin ? (
            <p className="text-sm text-muted-foreground">
              Solo un amministratore della tua azienda può accettare l’invito.
            </p>
          ) : (
            <Button disabled={busy} onClick={accept}>
              Accetta e collega {company.companyName}
            </Button>
          )}
        </section>
      )}
    </AppShell>
  );
}
