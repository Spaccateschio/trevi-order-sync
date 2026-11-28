import { ChevronDown, ChevronRight, TriangleAlert, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import {
  createDemoCustomers,
  documentStatus,
  euro,
  filterCustomers,
  hasOverdue,
  markPaid,
  openTotal,
  overdueTotal,
  paymentPlan,
  prettyDate,
  type BalanceFilter,
  type CustomerBalance,
  type CustomerDocument,
  type DocumentStatus,
} from "./documents-balance-demo-data";

const STATUS: Record<DocumentStatus, { label: string; cls: string }> = {
  pagato: { label: "Pagato", cls: "bg-success/15 text-success" },
  da_incassare: { label: "Da pagare", cls: "bg-warning/20 text-warning-foreground" },
  scaduto: { label: "Scaduto", cls: "bg-destructive/15 text-destructive" },
};

const FILTERS: { value: BalanceFilter; label: string }[] = [
  { value: "tutti", label: "Tutti" },
  { value: "da_incassare", label: "Da incassare" },
  { value: "scaduti", label: "Scaduti" },
];

/** Anteprima isolata: stato solo in memoria, nessuna scrittura. */
export function DocumentsBalanceMockup() {
  const [today] = useState(() => new Date());
  const [customers, setCustomers] = useState<CustomerBalance[]>(() => createDemoCustomers(today));
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BalanceFilter>("tutti");
  const [payingId, setPayingId] = useState<string | null>(null);

  const shown = useMemo(
    () => filterCustomers(customers, filter, query, today),
    [customers, filter, query, today],
  );

  const totals = useMemo(
    () => ({
      daIncassare: customers.reduce((sum, c) => sum + openTotal(c.documents, today), 0),
      scaduto: customers.reduce((sum, c) => sum + overdueTotal(c.documents, today), 0),
      scadutiClienti: customers.filter((c) => hasOverdue(c.documents, today)).length,
    }),
    [customers, today],
  );

  const paying = customers.find((c) => c.id === payingId) ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-3 pb-24">
      <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
        Anteprima di prova con aziende e documenti finti: nulla viene salvato.
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SummaryTile label="Da incassare" value={euro.format(totals.daIncassare)} />
        <SummaryTile
          label="Scaduto"
          value={euro.format(totals.scaduto)}
          {...(totals.scaduto > 0 ? { tone: "alert" as const } : {})}
        />
        <SummaryTile
          label="Clienti scaduti"
          value={String(totals.scadutiClienti)}
          className="col-span-2 sm:col-span-1"
          {...(totals.scadutiClienti > 0 ? { tone: "alert" as const } : {})}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca cliente, città o numero"
            aria-label="Cerca cliente, città o numero di documento"
            className="pl-9"
          />
          <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as BalanceFilter)}>
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
          Nessun cliente con questi filtri.
        </p>
      ) : null}

      {shown.map((customer) => (
        <CustomerCard
          key={customer.id}
          customer={customer}
          today={today}
          open={openId === customer.id}
          onToggle={() => setOpenId((cur) => (cur === customer.id ? null : customer.id))}
          onPay={() => setPayingId(customer.id)}
        />
      ))}

      <PaymentDialog
        customer={paying}
        today={today}
        onClose={() => setPayingId(null)}
        onConfirm={(ids) => {
          if (!paying) return;
          setCustomers((prev) =>
            prev.map((c) => (c.id === paying.id ? { ...c, documents: markPaid(c.documents, ids) } : c)),
          );
          toast.success(`Incasso registrato su ${paying.name} (anteprima)`);
          setPayingId(null);
        }}
      />
    </div>
  );
}

function SummaryTile({ label, value, tone, className }: { label: string; value: string; tone?: "alert"; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card p-3",
        tone === "alert" && "border-destructive/40 bg-destructive/10",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-display text-lg font-semibold", tone === "alert" && "text-destructive")}>
        {value}
      </p>
    </div>
  );
}

function CustomerCard({
  customer,
  today,
  open,
  onToggle,
  onPay,
}: {
  customer: CustomerBalance;
  today: Date;
  open: boolean;
  onToggle: () => void;
  onPay: () => void;
}) {
  const saldo = openTotal(customer.documents, today);
  const scaduto = overdueTotal(customer.documents, today);

  return (
    <Card>
      <CardContent className="p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-center gap-3 text-left"
        >
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{customer.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{customer.city}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-semibold tabular-nums">{euro.format(saldo)}</span>
            <span className="block text-xs text-muted-foreground">da incassare</span>
          </span>
        </button>

        {scaduto > 0 ? (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="flex-1">Scaduto {euro.format(scaduto)}</span>
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              Sollecito
            </Badge>
          </div>
        ) : null}

        {open ? (
          <div className="mt-3 space-y-1 border-t border-border pt-3">
            {customer.documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} today={today} />
            ))}
            <Button type="button" size="sm" className="mt-2 w-full" onClick={onPay} disabled={saldo <= 0}>
              Registra incasso
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DocumentRow({ doc, today }: { doc: CustomerDocument; today: Date }) {
  const status = documentStatus(doc, today);
  const badge = STATUS[status];
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {doc.kind} {doc.number}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {prettyDate(doc.date)}
          {doc.dueDate ? ` · scadenza ${prettyDate(doc.dueDate)}` : " · senza scadenza"}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-medium tabular-nums">{euro.format(doc.amount)}</span>
        <span className={cn("mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[11px]", badge.cls)}>
          {badge.label}
        </span>
      </span>
    </div>
  );
}

function PaymentDialog({
  customer,
  today,
  onClose,
  onConfirm,
}: {
  customer: CustomerBalance | null;
  today: Date;
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Bonifico");
  const [seenId, setSeenId] = useState<string | null>(null);

  if (!customer) return <Dialog open={false} onOpenChange={() => onClose()} />;

  if (seenId !== customer.id) {
    setSeenId(customer.id);
    setAmount(openTotal(customer.documents, today).toFixed(2).replace(".", ","));
    setMethod("Bonifico");
  }

  const numeric = Number(amount.replace(",", "."));
  const valid = Number.isFinite(numeric) && numeric > 0;
  const plan = valid ? paymentPlan(customer.documents, numeric, today) : { coveredIds: [], residual: 0 };
  const covered = customer.documents.filter((d) => plan.coveredIds.includes(d.id));

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registra incasso</DialogTitle>
          <DialogDescription>
            {customer.name} · saldo attuale {euro.format(openTotal(customer.documents, today))}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="incasso-importo">Importo incassato</Label>
            <Input
              id="incasso-importo"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="incasso-metodo">Metodo</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="incasso-metodo" className="w-full">
                <SelectValue placeholder="Scegli il metodo" />
              </SelectTrigger>
              <SelectContent>
                {["Bonifico", "Contanti", "Carta", "Assegno"].map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
            {covered.length > 0 ? (
              <>
                <p className="font-medium">Documenti coperti</p>
                <ul className="mt-1 space-y-0.5">
                  {covered.map((d) => (
                    <li key={d.id} className="flex justify-between gap-2">
                      <span>
                        {d.kind} {d.number}
                      </span>
                      <span className="tabular-nums">{euro.format(d.amount)}</span>
                    </li>
                  ))}
                </ul>
                {plan.residual > 0 ? (
                  <p className="mt-1 text-muted-foreground">
                    Avanzo non assegnato: {euro.format(plan.residual)}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">
                {valid
                  ? "L'importo non copre nessun documento per intero: i documenti restano aperti."
                  : "Inserisci un importo maggiore di zero."}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button type="button" disabled={!valid || plan.coveredIds.length === 0} onClick={() => onConfirm(plan.coveredIds)}>
            Registra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
