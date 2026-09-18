import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bell, KeyRound, Link2, Mail, QrCode, Search, Sparkles } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { sendInvitationEmail } from "@/lib/invitation-email.functions";

export const Route = createFileRoute("/_authenticated/collegamenti")({
  head: () => ({
    meta: [
      { title: "Collegamenti B2B — Trevi Fruit" },
      {
        name: "description",
        content:
          "Gestisci i rapporti con le altre aziende della piattaforma Trevi Fruit: connessioni, richieste, inviti e codici.",
      },
      { property: "og:title", content: "Collegamenti B2B — Trevi Fruit" },
      {
        property: "og:description",
        content:
          "Gestisci i rapporti con le altre aziende della piattaforma Trevi Fruit: connessioni, richieste, inviti e codici.",
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

type RelationMeta = {
  requestedAt: string | null;
  acceptedAt: string | null;
  updatedAt: string | null;
};

type View = "connessioni" | "ricerca" | "richieste" | "inviti";
/** Tab principali: Clienti (a cui vendo), Fornitori (da cui compro), Entrambi. */
type Tab = "clienti" | "fornitori" | "entrambi";
type StatoFilter = "tutti" | "attivi" | "attesa" | "sospesi" | "chiusi";

const tabLabels: Record<Tab, string> = {
  clienti: "Clienti",
  fornitori: "Fornitori",
  entrambi: "Entrambi",
};

const statoLabels: Record<StatoFilter, string> = {
  tutti: "Tutti gli stati",
  attivi: "Attivi",
  attesa: "In attesa",
  sospesi: "Sospesi",
  chiusi: "Rifiutati e chiusi",
};

function statusOf(relation: Relation, side: "venditore" | "acquirente") {
  if (relation.status === "in_attesa") {
    const waiting =
      (relation.origin === "richiesta_cliente" && side === "venditore") ||
      (relation.origin === "invito_fornitore" && side === "acquirente");
    return { label: waiting ? "Da approvare" : "In attesa", tone: "attesa" as const };
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
  const [tab, setTab] = useState<Tab>("clienti");
  const [stato, setStato] = useState<StatoFilter>("tutti");
  /** Link freschi ottenuti dopo un reinvio: il token non è recuperabile dal database. */
  const [freshLinks, setFreshLinks] = useState<Record<string, string>>({});
  const [listSearch, setListSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [searchRole, setSearchRole] = useState<"cliente" | "fornitore">("cliente");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [freeEmail, setFreeEmail] = useState("");
  const [freeResult, setFreeResult] = useState<{
    code: string;
    link: string;
    expiresAt?: string | null;
  } | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const company = activeCompany(identity);
  const isAdmin = hasRole(identity, "amministratore");

  /** Contatti aziendali stampati sul foglio invito: sola lettura. */
  const companyContact = useQuery({
    queryKey: ["company-contact", company?.companyId],
    enabled: Boolean(company?.companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("legal_name, email, phone")
        .eq("id", company!.companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function downloadFreeInvitePdf() {
    if (!freeResult) return;
    const { downloadInvitePdf } = await import("@/lib/invite-pdf");
    const invitedBy = [identity?.profile?.firstName, identity?.profile?.lastName]
      .filter(Boolean)
      .join(" ");
    await downloadInvitePdf({
      sellerName: companyContact.data?.legal_name ?? company?.companyName ?? "La tua azienda",
      sellerEmail: companyContact.data?.email ?? null,
      sellerPhone: companyContact.data?.phone ?? null,
      invitedBy: invitedBy || null,
      inviteCode: freeResult.code || null,
      inviteLink: freeResult.link,
      expiresAt: freeResult.expiresAt ?? null,
    });
  }
  const sells = companySells(identity);
  const buys = companyBuys(identity);

  const relations = identity?.relations ?? [];
  const asSeller = relations.filter((r) => r.sellerCompanyId === company?.companyId);
  const asBuyer = relations.filter((r) => r.buyerCompanyId === company?.companyId);

  const partnerIds = useMemo(
    () => [
      ...new Set([
        ...asSeller.map((r) => r.buyerCompanyId),
        ...asBuyer.map((r) => r.sellerCompanyId),
      ]),
    ],
    [asSeller, asBuyer],
  );

  // Solo lettura: date del rapporto e dati pubblici del partner, nessuna copia di dati.
  const metaQuery = useQuery({
    queryKey: ["relation-meta", company?.companyId, relations.length],
    queryFn: async () => {
      const [rels, comps] = await Promise.all([
        supabase
          .from("supplier_customer_relations")
          .select("id, requested_at, accepted_at, updated_at"),
        partnerIds.length
          ? supabase.from("companies").select("id, vat_number, city, province").in("id", partnerIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (rels.error) throw rels.error;
      if (comps.error) throw comps.error;
      const byRelation = new Map<string, RelationMeta>();
      for (const row of rels.data ?? [])
        byRelation.set(row.id, {
          requestedAt: row.requested_at,
          acceptedAt: row.accepted_at,
          updatedAt: row.updated_at,
        });
      const byCompany = new Map<string, { vat: string | null; place: string | null }>();
      for (const row of (comps.data ?? []) as {
        id: string;
        vat_number: string | null;
        city: string | null;
        province: string | null;
      }[])
        byCompany.set(row.id, {
          vat: row.vat_number,
          place:
            [row.city, row.province ? `(${row.province})` : null].filter(Boolean).join(" ") || null,
        });
      return { byRelation, byCompany };
    },
    enabled: Boolean(company),
  });

  const rows = useMemo<ConnectionRow[]>(() => {
    const buyerPartners = new Set(asBuyer.map((r) => r.sellerCompanyId));
    const sellerPartners = new Set(asSeller.map((r) => r.buyerCompanyId));
    const build = (relation: Relation, side: "venditore" | "acquirente"): ConnectionRow => {
      const partnerId = side === "venditore" ? relation.buyerCompanyId : relation.sellerCompanyId;
      const bothWays =
        side === "venditore" ? buyerPartners.has(partnerId) : sellerPartners.has(partnerId);
      const status = statusOf(relation, side);
      const partner = metaQuery.data?.byCompany.get(partnerId);
      const meta = metaQuery.data?.byRelation.get(relation.id);
      return {
        key: `${relation.id}-${side}`,
        relation,
        side,
        bothWays,
        partnerName:
          side === "venditore"
            ? (relation.buyerCompanyName ?? "Azienda cliente")
            : (relation.sellerCompanyName ?? "Azienda fornitrice"),
        partnerVat: partner?.vat ?? null,
        partnerPlace: partner?.place ?? null,
        relationshipLabel: bothWays
          ? "Entrambi"
          : side === "venditore"
            ? "Io vendo a"
            : "Io compro da",
        statusLabel: status.label,
        statusTone: status.tone,
        mySideEnabled: side === "venditore" ? relation.sellerEnabled : relation.buyerEnabled,
        partnerSideEnabled: side === "venditore" ? relation.buyerEnabled : relation.sellerEnabled,
        lastActivity: meta?.updatedAt ?? null,
      };
    };
    return [
      ...asSeller.map((r) => build(r, "venditore")),
      ...asBuyer.map((r) => build(r, "acquirente")),
    ].sort((a, b) => a.partnerName.localeCompare(b.partnerName, "it"));
  }, [asSeller, asBuyer, metaQuery.data]);

  const matchSearch = (row: ConnectionRow) => {
    const term = listSearch.trim().toLowerCase();
    if (!term) return true;
    return (
      row.partnerName.toLowerCase().includes(term) ||
      (row.partnerVat ?? "").toLowerCase().includes(term)
    );
  };

  /** Nei rapporti in due sensi si mostra una sola riga per azienda. */
  const singleRows = rows.filter((row) => !(row.bothWays && row.side === "acquirente"));

  const inTab = (row: ConnectionRow, key: Tab) => {
    if (key === "entrambi") return row.bothWays;
    if (key === "clienti") return row.side === "venditore" && !row.bothWays;
    return row.side === "acquirente" && !row.bothWays;
  };

  const passesStato = (row: ConnectionRow, key: StatoFilter) => {
    if (key === "attivi") return row.statusTone === "attivo";
    if (key === "attesa") return row.relation.status === "in_attesa";
    if (key === "sospesi") return row.statusTone === "sospeso";
    if (key === "chiusi") return row.statusTone === "chiuso";
    return true;
  };

  const tabCounts = Object.fromEntries(
    (Object.keys(tabLabels) as Tab[]).map((key) => [
      key,
      singleRows.filter((row) => inTab(row, key)).length,
    ]),
  ) as Record<Tab, number>;

  const visibleRows = singleRows.filter(
    (row) => matchSearch(row) && inTab(row, tab) && passesStato(row, stato),
  );
  const pendingRows = rows.filter((row) => row.relation.status === "in_attesa");
  const openRow = rows.find((row) => row.key === openKey) ?? null;

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

  async function refreshInvitations() {
    await queryClient.invalidateQueries({ queryKey: ["pending-invitations"] });
  }

  async function toggleSide(row: ConnectionRow, enabled: boolean) {
    const { error } = await supabase.rpc("set_relation_side_enabled", {
      _relation_id: row.relation.id,
      _enabled: enabled,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    await queryClient.invalidateQueries({ queryKey: ["relation-meta"] });
    toast.success(enabled ? "Il tuo lato è attivo." : "Il tuo lato è sospeso.");
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

  /**
   * Reinvio/rinnovo dell'invito: stessa funzione protetta già in uso, che
   * aggiorna scadenza e link dell'invito esistente senza crearne un altro.
   */
  async function resendInvitation(invitationId: string, expired: boolean) {
    setBusyId(invitationId);
    const { data, error } = await supabase.rpc("resend_customer_invitation", {
      _invitation_id: invitationId,
    });
    if (error) {
      setBusyId(null);
      toast.error(error.message);
      return;
    }
    const token = (data ?? [])[0]?.token;
    let emailed = false;
    if (token) {
      setFreshLinks((prev) => ({
        ...prev,
        [invitationId]: `${window.location.origin}/invito/${token}`,
      }));
      try {
        const result = await sendInvitationEmail({ data: { invitationId, token } });
        emailed = result.sent;
      } catch {
        /* codice e link restano validi */
      }
    }
    setBusyId(null);
    await refreshInvitations();
    toast.success(
      emailed
        ? expired
          ? "Invito rinnovato e inviato per email."
          : "Invito reinviato per email."
        : expired
          ? "Invito rinnovato: copia il link o il codice."
          : "Invito aggiornato: copia il link o il codice.",
    );
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
    const meta = await supabase
      .from("company_invitations")
      .select("expires_at")
      .eq("id", row.invitation_id)
      .maybeSingle();
    setFreeResult({
      code: row.invite_code ?? "",
      link: `${window.location.origin}/invito/${row.token}`,
      expiresAt: meta.data?.expires_at ?? null,
    });
    // Con un'email indicata l'invito parte anche via email; senza, restano codice e link.
    if (freeEmail.trim() !== "") {
      try {
        const result = await sendInvitationEmail({
          data: { invitationId: row.invitation_id, token: row.token },
        });
        if (result.sent) toast.success("Invito inviato per email.");
        else toast.info("Questo indirizzo non riceve le nostre email: usa il link o il codice.");
      } catch {
        toast.error("Email non inviata: puoi comunque usare il link o il codice.");
      }
    }
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

  return (
    <AppShell
      title="Collegamenti B2B"
      description="Gestisci i rapporti con le altre aziende della piattaforma Trevi Fruit."
      actions={
        <>
          <Button
            size="sm"
            variant="outline"
            className={
              view === "richieste"
                ? undefined
                : "border-destructive/25 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            }
            onClick={() => setView(view === "richieste" ? "connessioni" : "richieste")}
          >
            <Bell className="size-4" />
            Richieste
            <span className="ml-1 rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground">
              {pendingRows.length}
            </span>
          </Button>
          {sells ? (
            <Button
              size="sm"
              variant="outline"
              className={
                view === "inviti"
                  ? undefined
                  : "border-warning/40 bg-warning/10 text-warning-foreground hover:bg-warning/20"
              }
              onClick={() => setView(view === "inviti" ? "connessioni" : "inviti")}
            >
              <Mail className="size-4" />
              Inviti
              <span className="ml-1 rounded-full bg-warning px-1.5 text-xs text-warning-foreground">
                {pendingInvitations.length}
              </span>
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p> : null}

        {/* Barra viste principale: connessioni, ricerca e i due flussi rapidi. */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button
            size="sm"
            variant={view === "connessioni" ? "default" : "outline"}
            className="shrink-0"
            onClick={() => setView("connessioni")}
          >
            <Link2 className="size-4" />
            Le mie connessioni
          </Button>
          <Button
            size="sm"
            variant={view === "ricerca" ? "default" : "outline"}
            className="shrink-0"
            onClick={() => setView("ricerca")}
          >
            <Search className="size-4" />
            Cerca azienda
          </Button>
          {sells ? (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={!isAdmin}
              onClick={() => setInviteOpen(true)}
            >
              <Sparkles className="size-4" />
              Invita partner
            </Button>
          ) : null}
          {buys ? (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={!isAdmin}
              onClick={() => setCodeOpen(true)}
            >
              <KeyRound className="size-4" />
              Ho un codice
            </Button>
          ) : null}
        </div>

        {view === "connessioni" ? (
          <div className="space-y-3">
            <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
              <TabsList className="h-auto w-full justify-stretch gap-1 sm:w-auto sm:justify-start">
                {(Object.keys(tabLabels) as Tab[]).map((key) => (
                  <TabsTrigger key={key} value={key} className="flex-1 sm:flex-none">
                    {tabLabels[key]}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {tabCounts[key]}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-9"
                  value={listSearch}
                  onChange={(event) => setListSearch(event.target.value)}
                  placeholder="Cerca per ragione sociale o partita IVA…"
                  aria-label="Cerca fra le connessioni"
                />
              </div>
              <Select value={stato} onValueChange={(value) => setStato(value as StatoFilter)}>
                <SelectTrigger className="h-9 w-[168px]" aria-label="Filtra per stato">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(statoLabels) as StatoFilter[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {statoLabels[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ConnectionsTable
              rows={visibleRows}
              canManage={isAdmin}
              onOpen={(row) => setOpenKey(row.key)}
              onToggleSide={toggleSide}
            />
          </div>
        ) : null}

        {view === "ricerca" ? (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div>
              <h2 className="font-display text-base font-semibold">Cerca azienda</h2>
              <p className="text-sm text-muted-foreground">
                Cerca un'azienda già registrata su Trevi Fruit.
              </p>
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
                placeholder="Ragione sociale o partita IVA…"
                aria-label="Cerca azienda"
              />
              <Button type="submit" size="sm" variant="outline">
                Cerca azienda
              </Button>
            </form>
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
                        searchRole === "cliente"
                          ? inviteBuyer(option.id)
                          : requestSupplier(option.id)
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
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="font-display text-base font-semibold">Richieste</h2>
            {pendingRows.length ? (
              <ConnectionsTable
                rows={pendingRows}
                canManage={isAdmin}
                onOpen={(row) => setOpenKey(row.key)}
                onToggleSide={toggleSide}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Nessuna richiesta in corso.</p>
            )}
          </div>
        ) : null}

        {view === "inviti" ? (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="font-display text-base font-semibold">Inviti in attesa</h2>
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
                        {freshLinks[invitation.id] ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void navigator.clipboard.writeText(freshLinks[invitation.id]!);
                              toast.success("Link copiato.");
                            }}
                          >
                            Copia link
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!isAdmin || busyId === invitation.id}
                          onClick={() => resendInvitation(invitation.id, expired)}
                        >
                          {expired ? "Rinnova invito" : "Reinvia invito"}
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

        {/* Scorciatoie in fondo pagina, come nel nuovo layout. */}
        {view === "connessioni" ? (
          <div className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col rounded-2xl border border-primary/15 bg-primary/5 p-4">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Search className="size-5" />
              </span>
              <h3 className="mt-3 font-display text-base font-semibold">Cerca azienda</h3>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">
                Trova un'azienda già registrata su Trevi Fruit e richiedi il collegamento.
              </p>
              <Button className="mt-3 w-full" onClick={() => setView("ricerca")}>
                Cerca azienda <ArrowRight className="size-4" />
              </Button>
            </div>
            {sells ? (
              <div className="flex flex-col rounded-2xl border border-success/20 bg-success/5 p-4">
                <span className="grid size-10 place-items-center rounded-xl bg-success/10 text-success">
                  <Sparkles className="size-5" />
                </span>
                <h3 className="mt-3 font-display text-base font-semibold">Invita partner</h3>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">
                  Genera un codice invito da condividere, anche senza avere il partner in
                  anagrafica.
                </p>
                <Button
                  className="mt-3 w-full bg-success text-success-foreground hover:bg-success/90"
                  disabled={!isAdmin}
                  onClick={() => setInviteOpen(true)}
                >
                  Invita partner <ArrowRight className="size-4" />
                </Button>
              </div>
            ) : null}
            {buys ? (
              <div className="flex flex-col rounded-2xl border border-border bg-accent/30 p-4">
                <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                  <QrCode className="size-5" />
                </span>
                <h3 className="mt-3 font-display text-base font-semibold">Ho un codice</h3>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">
                  Inserisci il codice invito che hai ricevuto per collegarti con un'azienda.
                </p>
                <Button
                  className="mt-3 w-full"
                  disabled={!isAdmin}
                  onClick={() => setCodeOpen(true)}
                >
                  Inserisci codice <ArrowRight className="size-4" />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {isAdmin ? null : (
          <p className="text-sm text-muted-foreground">
            Solo un amministratore della tua azienda può gestire i collegamenti.
          </p>
        )}
      </div>

      <ConnectionDetail
        row={openRow}
        isAdmin={isAdmin}
        dates={openRow ? (metaQuery.data?.byRelation.get(openRow.relation.id) ?? null) : null}
        onClose={() => setOpenKey(null)}
      />

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
              Genera un invito B2B anche senza avere il partner in anagrafica. Per invitare un
              cliente già in anagrafica usa il pulsante Invita nella sua scheda.
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
              <Button variant="outline" onClick={downloadFreeInvitePdf}>
                Scarica PDF con QR
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="invito-email">Email (opzionale)</Label>
              <Input
                id="invito-email"
                type="email"
                value={freeEmail}
                onChange={(event) => setFreeEmail(event.target.value)}
                placeholder="es. nome@azienda.it"
              />
            </div>
          )}
          <DialogFooter>
            {freeResult ? (
              <Button onClick={() => setInviteOpen(false)}>Ho salvato codice e link</Button>
            ) : (
              <Button disabled={busy || !isAdmin} onClick={createFreeInvitation}>
                <Link2 className="size-4" />
                Genera codice invito
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ho un codice</DialogTitle>
            <DialogDescription>Inserisci il codice invito che hai ricevuto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="codice-invito">Codice invito</Label>
            <Input
              id="codice-invito"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="es. PPK2J5YH"
              className="font-mono tracking-widest"
            />
          </div>
          <DialogFooter>
            <Button
              className="w-full"
              disabled={busy || !isAdmin || code.trim() === ""}
              onClick={useInviteCode}
            >
              Continua
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
