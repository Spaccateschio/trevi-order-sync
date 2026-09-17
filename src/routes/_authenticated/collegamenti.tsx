import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { RelationCard } from "@/components/companies/relation-card";
import { Button } from "@/components/ui/button";
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
  activeCompany,
  companyBuys,
  companySells,
  hasRole,
  identityQueryKey,
  useIdentity,
  type Relation,
} from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/collegamenti")({
  head: () => ({
    meta: [
      { title: "Collegamenti — Trevi Fruit" },
      {
        name: "description",
        content:
          "I rapporti tra la tua azienda e le altre aziende Trevi Fruit: clienti, fornitori, richieste, inviti e codici.",
      },
      { property: "og:title", content: "Collegamenti — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "I rapporti tra la tua azienda e le altre aziende Trevi Fruit: clienti, fornitori, richieste, inviti e codici.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Collegamenti,
});

type CompanyOption = {
  id: string;
  legal_name: string;
  city: string | null;
  province: string | null;
};

type PendingInvitation = {
  id: string;
  email: string | null;
  invite_code: string | null;
  expires_at: string;
  resend_count: number;
  is_free_invite: boolean;
  customer_legal_name: string | null;
};

type Filter = "tutti" | "clienti" | "fornitori" | "attesa" | "sospesi";

const filterLabels: Record<Filter, string> = {
  tutti: "Tutti",
  clienti: "Clienti",
  fornitori: "Fornitori",
  attesa: "In attesa",
  sospesi: "Sospesi",
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Collegamenti() {
  const { data: identity, isLoading } = useIdentity();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("tutti");

  const [searchRole, setSearchRole] = useState<"cliente" | "fornitore">("cliente");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [freeOpen, setFreeOpen] = useState(false);
  const [freeEmail, setFreeEmail] = useState("");
  const [freeResult, setFreeResult] = useState<{ code: string; link: string } | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const company = activeCompany(identity);
  const isAdmin = hasRole(identity, "amministratore");
  const sells = companySells(identity);
  const buys = companyBuys(identity);

  const relations = identity?.relations ?? [];
  const asSeller = relations.filter((r) => r.sellerCompanyId === company?.companyId);
  const asBuyer = relations.filter((r) => r.buyerCompanyId === company?.companyId);

  const waitingOnMe = (r: Relation, side: "venditore" | "acquirente") =>
    r.status === "in_attesa" &&
    ((r.origin === "richiesta_cliente" && side === "venditore") ||
      (r.origin === "invito_fornitore" && side === "acquirente"));

  const incoming = [
    ...asSeller.filter((r) => waitingOnMe(r, "venditore")).map((r) => ({ r, side: "venditore" as const })),
    ...asBuyer.filter((r) => waitingOnMe(r, "acquirente")).map((r) => ({ r, side: "acquirente" as const })),
  ];
  const outgoing = [
    ...asSeller
      .filter((r) => r.status === "in_attesa" && !waitingOnMe(r, "venditore"))
      .map((r) => ({ r, side: "venditore" as const })),
    ...asBuyer
      .filter((r) => r.status === "in_attesa" && !waitingOnMe(r, "acquirente"))
      .map((r) => ({ r, side: "acquirente" as const })),
  ];

  // Elenco unico: una riga per rapporto, con il ruolo del partner.
  const partnerIdsAsBuyer = new Set(asBuyer.map((r) => r.sellerCompanyId));
  const partnerIdsAsSeller = new Set(asSeller.map((r) => r.buyerCompanyId));
  const linked = [
    ...asSeller.map((r) => ({
      r,
      side: "venditore" as const,
      bothWays: partnerIdsAsBuyer.has(r.buyerCompanyId),
    })),
    ...asBuyer.map((r) => ({
      r,
      side: "acquirente" as const,
      bothWays: partnerIdsAsSeller.has(r.sellerCompanyId),
    })),
  ];

  const visibleLinked = linked.filter(({ r, side }) => {
    if (filter === "clienti") return side === "venditore";
    if (filter === "fornitori") return side === "acquirente";
    if (filter === "attesa") return r.status === "in_attesa";
    if (filter === "sospesi")
      return r.status === "sospeso" || (r.status === "attivo" && (!r.sellerEnabled || !r.buyerEnabled));
    return true;
  });

  const invitationsQuery = useQuery({
    queryKey: ["pending-invitations", company?.companyId],
    queryFn: async (): Promise<PendingInvitation[]> => {
      const { data, error } = await supabase
        .from("company_invitations")
        .select(
          "id, email, invite_code, expires_at, resend_count, is_free_invite, customer_records(legal_name)",
        )
        .eq("seller_company_id", company!.companyId)
        .eq("status", "in_attesa")
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        email: row.email,
        invite_code: row.invite_code,
        expires_at: row.expires_at,
        resend_count: row.resend_count,
        is_free_invite: row.is_free_invite,
        customer_legal_name:
          (row.customer_records as { legal_name: string } | null)?.legal_name ?? null,
      }));
    },
    enabled: Boolean(company) && sells,
  });

  const searchResults = useQuery({
    queryKey: ["search-companies", searchRole, searchQuery],
    queryFn: async (): Promise<CompanyOption[]> => {
      const { data, error } = await supabase.rpc("search_companies", {
        _query: searchQuery,
        _role: searchRole,
      });
      if (error) throw error;
      return (data ?? []) as CompanyOption[];
    },
    enabled: Boolean(company) && searchQuery.length > 0,
  });

  const linkedBuyerIds = new Set(asSeller.map((r) => r.buyerCompanyId));
  const linkedSellerIds = new Set(asBuyer.map((r) => r.sellerCompanyId));
  const foundCompanies = (searchResults.data ?? []).filter((c) => {
    if (c.id === company?.companyId) return false;
    return searchRole === "cliente" ? !linkedBuyerIds.has(c.id) : !linkedSellerIds.has(c.id);
  });

  async function refreshInvitations() {
    await queryClient.invalidateQueries({ queryKey: ["pending-invitations"] });
  }

  async function inviteBuyer(buyerCompanyId: string) {
    if (!company) return;
    setBusyId(buyerCompanyId);
    const { error } = await supabase.rpc("invite_customer_relation", {
      _seller_company_id: company.companyId,
      _buyer_company_id: buyerCompanyId,
    });
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    toast.success("Invito inviato. Attendi la risposta del cliente.");
  }

  async function requestSupplier(sellerCompanyId: string) {
    if (!company) return;
    setBusyId(sellerCompanyId);
    const { error } = await supabase.rpc("request_supplier_relation", {
      _seller_company_id: sellerCompanyId,
      _buyer_company_id: company.companyId,
    });
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    toast.success("Richiesta inviata. Attendi l'approvazione del fornitore.");
  }

  async function resendInvitation(invitationId: string) {
    const { error } = await supabase.rpc("resend_customer_invitation", {
      _invitation_id: invitationId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshInvitations();
    toast.success("Invito rinnovato: genera di nuovo il link dalla scheda cliente.");
  }

  async function cancelInvitation(invitationId: string) {
    const { error } = await supabase.rpc("cancel_customer_invitation", {
      _invitation_id: invitationId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshInvitations();
    toast.success("Invito annullato.");
  }

  async function createFreeInvitation() {
    if (!company) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("create_free_invitation", {
      _seller_company_id: company.companyId,
      _email: freeEmail.trim() === "" ? null : freeEmail.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const row = (data ?? [])[0];
    if (!row) {
      toast.error("Invito non generato: riprova.");
      return;
    }
    setFreeResult({
      code: row.invite_code ?? "",
      link: `${window.location.origin}/invito/${row.token}`,
    });
    await refreshInvitations();
  }

  async function useInviteCode() {
    if (!company) return;
    setBusy(true);
    const { error } = await supabase.rpc("accept_invitation_code", {
      _code: code,
      _buyer_company_id: company.companyId,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCode("");
    setCodeOpen(false);
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    toast.success("Collegamento attivato.");
  }

  const pendingInvitations = invitationsQuery.data ?? [];

  return (
    <AppShell
      title="Collegamenti"
      description="I rapporti tra la tua azienda e le altre aziende Trevi Fruit. L'anagrafica dei clienti resta nella pagina Clienti."
    >
      <div className="space-y-8">
        {isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}

        <div className="flex flex-wrap gap-2">
          {sells ? (
            <Button size="sm" disabled={!isAdmin} onClick={() => setFreeOpen(true)}>
              Invito rapido
            </Button>
          ) : null}
          {buys ? (
            <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => setCodeOpen(true)}>
              Ho un codice invito
            </Button>
          ) : null}
        </div>

        {incoming.length ? (
          <Section title="Richieste da approvare" hint="Aspettano una tua decisione.">
            {incoming.map(({ r, side }) => (
              <RelationCard key={r.id} relation={r} side={side} isAdmin={isAdmin} />
            ))}
          </Section>
        ) : null}

        {outgoing.length ? (
          <Section title="Richieste inviate" hint="In attesa della risposta dell'altra azienda.">
            {outgoing.map(({ r, side }) => (
              <RelationCard key={r.id} relation={r} side={side} isAdmin={isAdmin} />
            ))}
          </Section>
        ) : null}

        <Section title="Aziende collegate" hint="Ruolo, stato e interruttore del tuo lato.">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(filterLabels) as Filter[]).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={filter === key ? "default" : "outline"}
                onClick={() => setFilter(key)}
              >
                {filterLabels[key]}
              </Button>
            ))}
          </div>
          {visibleLinked.length ? (
            <div className="space-y-3">
              {visibleLinked.map(({ r, side, bothWays }) => (
                <RelationCard
                  key={`${r.id}-${side}`}
                  relation={r}
                  side={side}
                  isAdmin={isAdmin}
                  bothWays={bothWays}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nessuna azienda in questo elenco. Usa l'invito rapido o la ricerca qui sotto.
            </p>
          )}
        </Section>

        <Section
          title="Cerca azienda"
          hint="Cerca per ragione sociale o partita IVA e proponi il collegamento."
        >
          <div className="flex flex-wrap gap-2">
            {sells ? (
              <Button
                size="sm"
                variant={searchRole === "cliente" ? "default" : "outline"}
                onClick={() => setSearchRole("cliente")}
              >
                Vendo a loro
              </Button>
            ) : null}
            {buys ? (
              <Button
                size="sm"
                variant={searchRole === "fornitore" ? "default" : "outline"}
                onClick={() => setSearchRole("fornitore")}
              >
                Compro da loro
              </Button>
            ) : null}
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSearchQuery(searchTerm.trim());
            }}
          >
            <Input
              className="max-w-sm"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Ragione sociale o partita IVA"
              aria-label="Cerca azienda"
            />
            <Button type="submit" size="sm" variant="outline">
              Cerca
            </Button>
          </form>
          {searchQuery === "" ? (
            <p className="text-sm text-muted-foreground">
              Scrivi almeno una parola del nome o le prime cifre della partita IVA.
            </p>
          ) : searchResults.isLoading ? (
            <p className="text-sm text-muted-foreground">Ricerca in corso…</p>
          ) : foundCompanies.length ? (
            <div className="space-y-3">
              {foundCompanies.map((option) => (
                <CompanyRow
                  key={option.id}
                  option={option}
                  actionLabel={searchRole === "cliente" ? "Invita" : "Chiedi collegamento"}
                  disabled={!isAdmin || busyId === option.id}
                  onAction={() =>
                    searchRole === "cliente" ? inviteBuyer(option.id) : requestSupplier(option.id)
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nessuna azienda trovata: se non è ancora su Trevi Fruit, usa l'invito rapido.
            </p>
          )}
        </Section>

        {sells ? (
          <Section
            title="Inviti in attesa"
            hint="Link e codici già generati che nessuno ha ancora usato."
          >
            {invitationsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Caricamento…</p>
            ) : pendingInvitations.length ? (
              <div className="space-y-3">
                {pendingInvitations.map((invitation) => {
                  const expired = new Date(invitation.expires_at).getTime() < Date.now();
                  return (
                    <section
                      key={invitation.id}
                      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-base font-semibold">
                            {invitation.customer_legal_name ??
                              invitation.email ??
                              "Invito rapido senza email"}
                          </h3>
                          {invitation.is_free_invite ? (
                            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                              Rapido
                            </span>
                          ) : null}
                          {expired ? (
                            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                              Scaduto
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {[
                            invitation.email,
                            invitation.invite_code ? `codice ${invitation.invite_code}` : null,
                            `${expired ? "scaduto il" : "scade il"} ${new Date(
                              invitation.expires_at,
                            ).toLocaleDateString("it-IT")}`,
                            invitation.resend_count ? `rinnovi: ${invitation.resend_count}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {invitation.invite_code ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void navigator.clipboard.writeText(invitation.invite_code!);
                              toast.success("Codice copiato.");
                            }}
                          >
                            Copia codice
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!isAdmin}
                          onClick={() => resendInvitation(invitation.id)}
                        >
                          Rinnova
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!isAdmin}
                          onClick={() => cancelInvitation(invitation.id)}
                        >
                          Annulla
                        </Button>
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nessun invito in attesa. Puoi generarne uno con Invito rapido o dalla scheda del
                cliente.
              </p>
            )}
          </Section>
        ) : null}

        {isAdmin ? null : (
          <p className="text-sm text-muted-foreground">
            Solo un amministratore della tua azienda può gestire i collegamenti.
          </p>
        )}
      </div>

      <Dialog
        open={freeOpen}
        onOpenChange={(open) => {
          setFreeOpen(open);
          if (!open) {
            setFreeEmail("");
            setFreeResult(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invito rapido</DialogTitle>
            <DialogDescription>
              Genera un codice e un link da mandare come vuoi, senza compilare prima la scheda
              cliente.
            </DialogDescription>
          </DialogHeader>
          {freeResult ? (
            <div className="space-y-3">
              <div>
                <Label>Codice</Label>
                <p className="mt-1 font-mono text-lg tracking-widest">{freeResult.code}</p>
              </div>
              <div>
                <Label htmlFor="invito-link">Link</Label>
                <Input id="invito-link" readOnly value={freeResult.link} />
              </div>
              <p className="text-sm text-muted-foreground">
                Chi ha già un account Trevi Fruit usa il codice; chi non lo ha apre il link e si
                registra. Il link non è più recuperabile dopo la chiusura di questa finestra.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `Codice: ${freeResult.code}\nLink: ${freeResult.link}`,
                  );
                  toast.success("Codice e link copiati.");
                }}
              >
                Copia codice e link
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="invito-email">Email (facoltativa)</Label>
              <Input
                id="invito-email"
                type="email"
                value={freeEmail}
                onChange={(event) => setFreeEmail(event.target.value)}
                placeholder="cliente@esempio.it"
              />
            </div>
          )}
          <DialogFooter>
            {freeResult ? (
              <Button onClick={() => setFreeOpen(false)}>Ho salvato codice e link</Button>
            ) : (
              <Button disabled={busy || !isAdmin} onClick={createFreeInvitation}>
                Genera invito
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ho un codice invito</DialogTitle>
            <DialogDescription>
              Inserisci il codice ricevuto dal fornitore: il collegamento si attiva subito.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="codice-invito">Codice</Label>
            <Input
              id="codice-invito"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ABCD2345"
              className="font-mono tracking-widest"
            />
          </div>
          <DialogFooter>
            <Button disabled={busy || !isAdmin || code.trim() === ""} onClick={useInviteCode}>
              Collega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function CompanyRow({
  option,
  actionLabel,
  disabled,
  onAction,
}: {
  option: CompanyOption;
  actionLabel: string;
  disabled: boolean;
  onAction: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h3 className="font-display text-base font-semibold">{option.legal_name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {[option.city, option.province].filter(Boolean).join(" · ") || "Sede non indicata"}
        </p>
      </div>
      <Button size="sm" disabled={disabled} onClick={onAction}>
        {actionLabel}
      </Button>
    </section>
  );
}
