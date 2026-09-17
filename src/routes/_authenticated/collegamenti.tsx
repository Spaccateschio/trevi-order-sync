import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ConnectionDetail } from "@/components/companies/connection-detail";
import { ConnectionsTable, type ConnectionRow } from "@/components/companies/connections-table";
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
  isRelationOperational,
  useIdentity,
  type Relation,
} from "@/hooks/use-identity";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/collegamenti")({
  head: () => ({
    meta: [
      { title: "Collegamenti B2B — Trevi Fruit" },
      {
        name: "description",
        content:
          "Gestisci i collegamenti tra la tua azienda e le altre aziende Trevi Fruit: connessioni, richieste, inviti e codici.",
      },
      { property: "og:title", content: "Collegamenti B2B — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "Gestisci i collegamenti tra la tua azienda e le altre aziende Trevi Fruit: connessioni, richieste, inviti e codici.",
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

type View = "connessioni" | "ricerca" | "richieste" | "inviti";
type Filter = "tutti" | "vendo" | "compro" | "attesa" | "sospesi";

const filterLabels: Record<Filter, string> = {
  tutti: "Tutti",
  vendo: "Io vendo",
  compro: "Io compro",
  attesa: "In attesa",
  sospesi: "Sospesi",
};

function statusOf(relation: Relation, side: "venditore" | "acquirente") {
  if (relation.status === "in_attesa") {
    const waitingOnMe =
      (relation.origin === "richiesta_cliente" && side === "venditore") ||
      (relation.origin === "invito_fornitore" && side === "acquirente");
    return {
      label: waitingOnMe ? "Da approvare" : "In attesa",
      tone: "attesa" as const,
    };
  }
  if (relation.status === "rifiutato") return { label: "Rifiutato", tone: "chiuso" as const };
  if (relation.status === "revocato") return { label: "Chiuso", tone: "chiuso" as const };
  if (relation.status === "sospeso") return { label: "Sospeso", tone: "sospeso" as const };
  if (isRelationOperational(relation)) return { label: "Attivo", tone: "attivo" as const };
  return { label: "Sospeso", tone: "sospeso" as const };
}

function Collegamenti() {
  const { data: identity, isLoading } = useIdentity();
  const queryClient = useQueryClient();

  const [view, setView] = useState<View>("connessioni");
  const [filter, setFilter] = useState<Filter>("tutti");
  const [listSearch, setListSearch] = useState("");
  const [openRow, setOpenRow] = useState<ConnectionRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [searchRole, setSearchRole] = useState<"cliente" | "fornitore">("cliente");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
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

  const rows = useMemo<ConnectionRow[]>(() => {
    const buyerPartners = new Set(asBuyer.map((r) => r.sellerCompanyId));
    const sellerPartners = new Set(asSeller.map((r) => r.buyerCompanyId));
    const build = (relation: Relation, side: "venditore" | "acquirente") => {
      const bothWays =
        side === "venditore"
          ? buyerPartners.has(relation.buyerCompanyId)
          : sellerPartners.has(relation.sellerCompanyId);
      const status = statusOf(relation, side);
      const myEnabled = side === "venditore" ? relation.sellerEnabled : relation.buyerEnabled;
      return {
        key: `${relation.id}-${side}`,
        relation,
        side,
        bothWays,
        partnerName:
          side === "venditore"
            ? relation.buyerCompanyName ?? "Azienda cliente"
            : relation.sellerCompanyName ?? "Azienda fornitrice",
        relationshipLabel: bothWays ? "Entrambi" : side === "venditore" ? "Io vendo a" : "Io compro da",
        statusLabel: status.label,
        statusTone: status.tone,
        mySideLabel: myEnabled ? "Attivo" : "Sospeso",
      } satisfies ConnectionRow;
    };
    return [
      ...asSeller.map((r) => build(r, "venditore")),
      ...asBuyer.map((r) => build(r, "acquirente")),
    ].sort((a, b) => a.partnerName.localeCompare(b.partnerName, "it"));
  }, [asSeller, asBuyer]);

  const visibleRows = rows.filter((row) => {
    if (listSearch.trim() && !row.partnerName.toLowerCase().includes(listSearch.trim().toLowerCase()))
      return false;
    if (filter === "vendo") return row.side === "venditore";
    if (filter === "compro") return row.side === "acquirente";
    if (filter === "attesa") return row.relation.status === "in_attesa";
    if (filter === "sospesi") return row.statusTone === "sospeso";
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

  const pendingInvitations = invitationsQuery.data ?? [];
  const requestCount = incoming.length + outgoing.length;

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
    toast.success("Richiesta inviata. Attendi la risposta dell'azienda.");
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
    toast.success("Invito rinnovato.");
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
      ...(freeEmail.trim() === "" ? {} : { _email: freeEmail.trim() }),
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
      _code: code.trim(),
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

  const tabs: { key: View; label: string }[] = [
    { key: "connessioni", label: "Le mie connessioni" },
    { key: "ricerca", label: "Cerca azienda" },
  ];

  return (
    <AppShell
      title="Collegamenti B2B"
      description="Gestisci i collegamenti con le aziende partner. L'anagrafica commerciale resta in Vendite → Clienti."
    >
      <div className="space-y-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}

        {/* Barra compatta */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              size="sm"
              variant={view === tab.key ? "default" : "ghost"}
              onClick={() => setView(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
          {sells ? (
            <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => setInviteOpen(true)}>
              Invita partner
            </Button>
          ) : null}
          {buys ? (
            <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => setCodeOpen(true)}>
              Ho un codice
            </Button>
          ) : null}
          <span className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant={view === "richieste" ? "default" : "ghost"}
              onClick={() => setView(view === "richieste" ? "connessioni" : "richieste")}
            >
              Richieste ({requestCount})
            </Button>
            {sells ? (
              <Button
                size="sm"
                variant={view === "inviti" ? "default" : "ghost"}
                onClick={() => setView(view === "inviti" ? "connessioni" : "inviti")}
              >
                Inviti ({pendingInvitations.length})
              </Button>
            ) : null}
          </span>
        </div>

        {view === "connessioni" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-9 w-full max-w-xs"
                value={listSearch}
                onChange={(event) => setListSearch(event.target.value)}
                placeholder="Cerca…"
                aria-label="Cerca fra le connessioni"
              />
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
              <span className="ml-auto text-sm text-muted-foreground">
                {visibleRows.length} di {rows.length}
              </span>
            </div>
            <ConnectionsTable rows={visibleRows} onOpen={setOpenRow} />
          </div>
        ) : null}

        {view === "ricerca" ? (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap gap-2">
              {sells ? (
                <Button
                  size="sm"
                  variant={searchRole === "cliente" ? "default" : "outline"}
                  onClick={() => setSearchRole("cliente")}
                >
                  Voglio vendere a questa azienda
                </Button>
              ) : null}
              {buys ? (
                <Button
                  size="sm"
                  variant={searchRole === "fornitore" ? "default" : "outline"}
                  onClick={() => setSearchRole("fornitore")}
                >
                  Voglio comprare da questa azienda
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
                className="h-9 max-w-sm"
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
              <div className="divide-y divide-border">
                {foundCompanies.map((option) => (
                  <div
                    key={option.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{option.legal_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {[option.city, option.province].filter(Boolean).join(" · ") ||
                          "Sede non indicata"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={!isAdmin || busyId === option.id}
                      onClick={() =>
                        searchRole === "cliente" ? inviteBuyer(option.id) : requestSupplier(option.id)
                      }
                    >
                      Richiedi collegamento
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nessuna azienda trovata: se non è ancora su Trevi Fruit, usa Invita partner.
              </p>
            )}
          </div>
        ) : null}

        {view === "richieste" ? (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Richieste
            </h2>
            {requestCount ? (
              <ConnectionsTable
                rows={rows.filter((row) => row.relation.status === "in_attesa")}
                onOpen={setOpenRow}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Nessuna richiesta in corso.</p>
            )}
          </div>
        ) : null}

        {view === "inviti" ? (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Inviti in attesa
            </h2>
            {invitationsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Caricamento…</p>
            ) : pendingInvitations.length ? (
              <div className="divide-y divide-border">
                {pendingInvitations.map((invitation) => {
                  const expired = new Date(invitation.expires_at).getTime() < Date.now();
                  return (
                    <div
                      key={invitation.id}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            {invitation.customer_legal_name ??
                              invitation.email ??
                              "Invito rapido senza email"}
                          </p>
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
                        <p className="text-sm text-muted-foreground">
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
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nessun invito in attesa. Puoi generarne uno con Invita partner o dalla scheda del
                cliente.
              </p>
            )}
          </div>
        ) : null}

        {isAdmin ? null : (
          <p className="text-sm text-muted-foreground">
            Solo un amministratore della tua azienda può gestire i collegamenti.
          </p>
        )}
      </div>

      <ConnectionDetail row={openRow} isAdmin={isAdmin} onClose={() => setOpenRow(null)} />

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) {
            setFreeEmail("");
            setFreeResult(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invita partner</DialogTitle>
            <DialogDescription>
              Genera un codice e un link da mandare come vuoi. Per invitare un cliente già in
              anagrafica usa il pulsante Invita nella sua scheda.
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
                registra. Dopo la chiusura di questa finestra il link non è più recuperabile.
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
              <Button onClick={() => setInviteOpen(false)}>Ho salvato codice e link</Button>
            ) : (
              <Button disabled={busy || !isAdmin} onClick={createFreeInvitation}>
                Invito rapido
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ho un codice</DialogTitle>
            <DialogDescription>Inserisci il codice invito ricevuto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="codice-invito">Codice invito</Label>
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
              Continua
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
