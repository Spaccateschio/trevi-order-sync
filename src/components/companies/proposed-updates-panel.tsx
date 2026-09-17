import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { customerRecordsQueryKey } from "@/components/companies/customer-records-panel";

/**
 * Differenze fra i dati confermati dal cliente al momento della registrazione
 * e la scheda cliente del venditore. Nulla viene mai sovrascritto in automatico:
 * il venditore decide riga per riga.
 */
type Proposal = {
  id: string;
  customer_record_id: string;
  field_name: string;
  current_value: string | null;
  proposed_value: string | null;
  customer_records: { legal_name: string } | null;
};

const FIELD_LABELS: Record<string, string> = {
  legal_name: "Ragione sociale",
  vat_number: "Partita IVA",
  tax_code: "Codice fiscale",
  email: "Email",
  phone: "Telefono",
  address_line: "Indirizzo",
  postal_code: "CAP",
  city: "Città",
  province: "Provincia",
  delivery_address_line: "Indirizzo di consegna",
  delivery_postal_code: "CAP consegna",
  delivery_city: "Città consegna",
  delivery_province: "Provincia consegna",
};

export const proposedUpdatesQueryKey = ["customer-record-proposals"] as const;

export function ProposedUpdatesPanel({
  companyId,
  isAdmin,
}: {
  companyId: string;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();

  const proposalsQuery = useQuery({
    queryKey: proposedUpdatesQueryKey,
    queryFn: async (): Promise<Proposal[]> => {
      const { data, error } = await supabase
        .from("customer_record_proposed_updates")
        .select(
          "id, customer_record_id, field_name, current_value, proposed_value, customer_records(legal_name)",
        )
        .eq("seller_company_id", companyId)
        .eq("status", "in_attesa")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Proposal[];
    },
  });

  async function decide(id: string, accept: boolean) {
    const { error } = await supabase.rpc("decide_proposed_update", {
      _proposal_id: id,
      _accept: accept,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: proposedUpdatesQueryKey }),
      queryClient.invalidateQueries({ queryKey: customerRecordsQueryKey }),
    ]);
    toast.success(accept ? "Dato aggiornato nella tua anagrafica." : "Proposta rifiutata.");
  }

  const proposals = proposalsQuery.data ?? [];
  if (!proposals.length) return null;

  return (
    <div className="space-y-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Aggiornamenti proposti dai clienti
      </h2>
      <p className="text-sm text-muted-foreground">
        Il cliente ha confermato dati diversi dai tuoi. Decidi tu se recepirli.
      </p>
      {proposals.map((proposal) => (
        <section
          key={proposal.id}
          className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {proposal.customer_records?.legal_name ?? "Cliente"} ·{" "}
              {FIELD_LABELS[proposal.field_name] ?? proposal.field_name}
            </p>
            <p className="text-sm text-muted-foreground">
              Tuo dato: {proposal.current_value || "—"} → proposto:{" "}
              {proposal.proposed_value || "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!isAdmin} onClick={() => decide(proposal.id, true)}>
              Aggiorna
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!isAdmin}
              onClick={() => decide(proposal.id, false)}
            >
              Ignora
            </Button>
          </div>
        </section>
      ))}
    </div>
  );
}
