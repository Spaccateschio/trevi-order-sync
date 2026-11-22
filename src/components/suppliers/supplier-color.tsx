import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { SUPPLIER_COLOR_NAMES, SUPPLIER_PALETTE, isSupplierColorCode, productSupplierTones, resolveSupplierColor, supplierColorVar, type ProductSupplierTone, type SupplierColorCode } from "@/lib/supplier-color";

type ColorRecord = { name: string; color: SupplierColorCode };
type ColorLink = { recordId: string; preferred: boolean; priority: number | null };

/** Due letture per pagina (anagrafiche + collegamenti attivi), condivise in cache: mai una per card. */
export function useSupplierColors(companyId: string | null | undefined) {
  const records = useQuery({
    queryKey: ["supplier-colors", "records", companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("supplier_records").select("id, legal_name, display_color").eq("buyer_company_id", companyId!);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const links = useQuery({
    queryKey: ["supplier-colors", "links", companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("product_supplier_links").select("product_id, supplier_record_id, is_preferred, sourcing_priority").eq("company_id", companyId!).eq("is_active", true);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  return useMemo(() => {
    const byId = new Map<string, ColorRecord>();
    const byName = new Map<string, ColorRecord & { recordId: string }>();
    for (const r of records.data ?? []) {
      const rec = { name: r.legal_name as string, color: resolveSupplierColor(r.id as string, r.display_color as string | null) };
      byId.set(r.id as string, rec);
      byName.set(rec.name.trim().toLowerCase(), { ...rec, recordId: r.id as string });
    }
    const byProduct = new Map<string, ColorLink[]>();
    for (const l of links.data ?? []) {
      const list = byProduct.get(l.product_id as string) ?? [];
      list.push({ recordId: l.supplier_record_id as string, preferred: Boolean(l.is_preferred), priority: (l.sourcing_priority as number | null) ?? null });
      byProduct.set(l.product_id as string, list);
    }
    const tonesFor = (productId: string | null | undefined, quotas?: { recordId: string; quantity: number | null }[]): ProductSupplierTone[] =>
      productSupplierTones({ links: productId ? byProduct.get(productId) ?? [] : [], quotas, records: byId });
    const toneByName = (name: string | null | undefined) => (name ? byName.get(name.trim().toLowerCase()) ?? null : null);
    const savedColor = (recordId: string) => {
      const raw = (records.data ?? []).find((r) => r.id === recordId)?.display_color as string | null | undefined;
      return isSupplierColorCode(raw) ? raw : null;
    };
    const colorOf = (recordId: string) => byId.get(recordId)?.color ?? null;
    return { ready: Boolean(records.data && links.data), tonesFor, toneByName, savedColor, colorOf };
  }, [records.data, links.data]);
}

export const supplierToneStyle = (tone: { color: SupplierColorCode } | null | undefined): CSSProperties | undefined =>
  tone ? ({ "--supplier-tone": supplierColorVar(tone.color) } as CSSProperties) : undefined;

export function SupplierDot({ color, className }: { color: SupplierColorCode; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2.5 shrink-0 rounded-full border border-foreground/20", className)} style={{ backgroundColor: supplierColorVar(color) }} />;
}

/** Cornice della card: tinta del principale, fasce a sinistra (una per fornitore) e nome scritto. Stati e badge restano nella card. */
export function SupplierTintFrame({ tones, children, className }: { tones: ProductSupplierTone[]; children: ReactNode; className?: string }) {
  if (!tones.length) return <div className={cn("min-w-0", className)}>{children}</div>;
  const main = tones[0]!;
  return (
    <div className={cn("supplier-tint relative min-w-0 pb-0.5 pl-2.5 pr-0.5 pt-0.5", className)} style={supplierToneStyle(main)} data-supplier={main.recordId}>
      <div aria-hidden="true" className="absolute inset-y-0 left-0 flex w-1.5 overflow-hidden rounded-l-md">
        {tones.slice(0, 4).map((t) => <span key={t.recordId} className="flex-1" style={{ backgroundColor: supplierColorVar(t.color) }} />)}
      </div>
      <p className="mb-0.5 truncate px-0.5 text-[10px] font-semibold text-foreground/80">
        <span className="sr-only">Fornitore: </span>
        {tones.map((t) => t.name).join(" · ")}
      </p>
      {children}
    </div>
  );
}

/** Legenda dei fornitori presenti nella pagina; toccando si filtra solo a schermo. */
export function SupplierLegend({ tones, active, onToggle }: { tones: ProductSupplierTone[]; active: string | null; onToggle: (recordId: string | null) => void }) {
  if (!tones.length) return null;
  return (
    <div aria-label="Colori fornitori" className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1 [&>*]:shrink-0">
      {tones.map((t) => {
        const on = active === t.recordId;
        return (
          <button key={t.recordId} type="button" aria-pressed={on} onClick={() => onToggle(on ? null : t.recordId)}
            className={cn("inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] font-medium text-foreground", on ? "border-primary ring-1 ring-primary" : "border-border")}
            style={{ backgroundColor: `color-mix(in oklch, ${supplierColorVar(t.color)} 30%, var(--background))` }}>
            <SupplierDot color={t.color} />{t.name}
          </button>
        );
      })}
    </div>
  );
}

/** Scelta colore nella scheda fornitore: solo amministratori (il DB lo verifica con la policy esistente). */
export function SupplierColorPicker({ companyId, recordId, isAdmin }: { companyId: string; recordId: string; isAdmin: boolean }) {
  const colors = useSupplierColors(companyId);
  const queryClient = useQueryClient();
  const saved = colors.savedColor(recordId);
  const current = colors.colorOf(recordId);
  const save = useMutation({
    mutationFn: async (code: SupplierColorCode | null) => {
      const { error } = await supabase.from("supplier_records").update({ display_color: code }).eq("id", recordId).eq("buyer_company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["supplier-colors"] }); toast.success("Colore del fornitore aggiornato"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">Colore del fornitore</p>
      <div role="radiogroup" aria-label="Colore del fornitore" className="flex flex-wrap gap-1.5">
        {SUPPLIER_PALETTE.map((code) => (
          <button key={code} type="button" role="radio" aria-checked={current === code} aria-label={SUPPLIER_COLOR_NAMES[code]} title={SUPPLIER_COLOR_NAMES[code]}
            disabled={!isAdmin || save.isPending} onClick={() => save.mutate(code)}
            className={cn("size-7 rounded-full border border-foreground/20 disabled:cursor-not-allowed disabled:opacity-60", current === code && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
            style={{ backgroundColor: supplierColorVar(code) }} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {saved ? `Scelto: ${SUPPLIER_COLOR_NAMES[saved]}` : current ? `Automatico: ${SUPPLIER_COLOR_NAMES[current]}` : "Automatico"}
        {isAdmin ? (saved ? <> · <button type="button" className="underline" disabled={save.isPending} onClick={() => save.mutate(null)}>torna all'automatico</button></> : null) : " · solo gli amministratori possono cambiarlo"}
      </p>
    </div>
  );
}
