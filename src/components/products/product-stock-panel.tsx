import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  dateTimeShort,
  parseQuantity,
  purchaseNeed,
  qty,
  STOCK_STATUS_LABEL,
  type StockOverview,
} from "@/lib/inventory";
import { manageProductStockSettings, recordInventoryAdjustment } from "@/lib/inventory.functions";
import type { CompanyUnit } from "./sales-unit-manager";

/** Riquadro Inventario della scheda prodotto: giacenza per zona, parametri di magazzino e rettifiche. */
export function ProductStockPanel({
  companyId,
  productId,
  daneaUm,
  units,
  editable,
}: {
  companyId: string;
  productId: string;
  daneaUm: string | null;
  units: CompanyUnit[];
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const saveSettings = useServerFn(manageProductStockSettings);
  const saveAdjustment = useServerFn(recordInventoryAdjustment);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [settings, setSettings] = useState({ minStock: "", orderMultiple: "", unitId: "", coverageDays: "" });
  const [adjust, setAdjust] = useState({ locationId: "", quantity: "", reason: "" });

  const overviewQuery = useQuery({
    queryKey: ["product-stock", productId],
    queryFn: async (): Promise<StockOverview> => {
      const { data, error } = await supabase.rpc("product_stock_overview", { _product_id: productId });
      if (error) throw new Error(error.message);
      return data as unknown as StockOverview;
    },
  });

  const overview = overviewQuery.data;

  useEffect(() => {
    if (!overview) return;
    setSettings({
      minStock: overview.min_stock !== null ? String(overview.min_stock) : "",
      orderMultiple: overview.order_multiple !== null ? String(overview.order_multiple) : "",
      unitId: overview.stock_unit_id ?? "",
      coverageDays: overview.coverage_days !== null ? String(overview.coverage_days) : "",
    });
  }, [overview]);

  useEffect(() => {
    if (adjust.locationId || !overview?.locations.length) return;
    const first = overview.locations.find((row) => row.is_default) ?? overview.locations[0];
    if (first) setAdjust((current) => ({ ...current, locationId: first.location_id }));
  }, [overview, adjust.locationId]);

  const settingsMutation = useMutation({
    mutationFn: async () => {
      const minStock = parseQuantity(settings.minStock);
      const orderMultiple = parseQuantity(settings.orderMultiple);
      const coverage = parseQuantity(settings.coverageDays);
      if (orderMultiple !== null && orderMultiple <= 0) throw new Error("Il multiplo deve essere maggiore di zero");
      if (minStock !== null && minStock < 0) throw new Error("La scorta minima non può essere negativa");
      const clearFields: ("min_stock" | "order_multiple" | "stock_unit_id" | "coverage_days")[] = [];
      if (!settings.minStock.trim()) clearFields.push("min_stock");
      if (!settings.orderMultiple.trim()) clearFields.push("order_multiple");
      if (!settings.unitId) clearFields.push("stock_unit_id");
      if (!settings.coverageDays.trim()) clearFields.push("coverage_days");
      return saveSettings({
        data: {
          companyId,
          productIds: [productId],
          minStock,
          orderMultiple,
          stockUnitId: settings.unitId || null,
          coverageDays: coverage === null ? null : Math.round(coverage),
          perishability: null,
          notes: null,
          clearFields,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["product-stock", productId] });
      setSettingsOpen(false);
      toast.success("Parametri di magazzino salvati");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const quantity = parseQuantity(adjust.quantity);
      if (quantity === null || quantity === 0) throw new Error("Indica una quantità diversa da zero");
      if (adjust.reason.trim().length < 3) throw new Error("Indica il motivo della rettifica");
      if (!adjust.locationId) throw new Error("Scegli la zona");
      return saveAdjustment({
        data: {
          companyId,
          productId,
          locationId: adjust.locationId,
          quantity,
          reason: adjust.reason.trim(),
          notes: null,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["product-stock", productId] });
      setAdjust((current) => ({ ...current, quantity: "", reason: "" }));
      setAdjustOpen(false);
      toast.success("Rettifica registrata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const need = overview
    ? purchaseNeed(0, overview.min_stock, overview.total, overview.order_multiple)
    : null;

  return (
    <section aria-labelledby="stock-title">
      <div className="flex items-center justify-between gap-2">
        <h3 id="stock-title" className="text-sm font-semibold">
          Inventario
        </h3>
        {overview ? (
          <Badge variant={overview.status === "completo" ? "secondary" : "outline"}>
            {STOCK_STATUS_LABEL[overview.status]}
          </Badge>
        ) : null}
      </div>

      {overviewQuery.isLoading ? <p className="mt-2 text-sm text-muted-foreground">Caricamento…</p> : null}

      {overview ? (
        <>
          <div className="mt-3 divide-y divide-border">
            {overview.locations.map((row) => (
              <div key={row.location_id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span className="truncate">{row.location_name}</span>
                <span className={row.has_count ? "" : "text-muted-foreground"}>
                  {row.has_count ? `${qty(row.quantity)} ${daneaUm ?? ""}`.trim() : "mai contato"}
                  {row.counted_at ? (
                    <span className="ml-2 text-xs text-muted-foreground">{dateTimeShort(row.counted_at)}</span>
                  ) : null}
                </span>
              </div>
            ))}
            {!overview.locations.length ? (
              <p className="py-2 text-sm text-muted-foreground">Nessuna zona configurata.</p>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 rounded-md bg-muted/30 p-2 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Disponibile</p>
              <p>{overview.status === "mai_contato" ? "—" : qty(overview.total)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Scorta minima</p>
              <p>{overview.min_stock !== null ? qty(overview.min_stock) : "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Multiplo</p>
              <p>{overview.order_multiple !== null ? qty(overview.order_multiple) : "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Da ripristinare</p>
              <p>
                {need ? qty(need.suggested) : "—"}
                {need?.rounded ? (
                  <span className="ml-1 text-xs text-muted-foreground">(da {qty(need.rawNeed)})</span>
                ) : null}
              </p>
            </div>
          </div>

          {editable ? (
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
                Parametri magazzino
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!overview.locations.length}
                onClick={() => setAdjustOpen(true)}
              >
                Rettifica
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parametri di magazzino</DialogTitle>
            <DialogDescription>
              Valori impostati da te. Le future proposte automatiche del sistema resteranno separate e non li sovrascriveranno.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Scorta minima
              <Input
                className="mt-1"
                inputMode="decimal"
                value={settings.minStock}
                onChange={(event) => setSettings((current) => ({ ...current, minStock: event.target.value }))}
              />
            </label>
            <label className="block text-sm">
              Multiplo di riordino
              <Input
                className="mt-1"
                inputMode="decimal"
                value={settings.orderMultiple}
                onChange={(event) => setSettings((current) => ({ ...current, orderMultiple: event.target.value }))}
              />
            </label>
            <label className="block text-sm">
              U.M. di riferimento
              <Select
                value={settings.unitId || "none"}
                onValueChange={(value) =>
                  setSettings((current) => ({ ...current, unitId: value === "none" ? "" : value }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Nessuna" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuna</SelectItem>
                  {units
                    .filter((unit) => unit.status === "attivo")
                    .map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.code} — {unit.description}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block text-sm">
              Giorni di copertura desiderati
              <Input
                className="mt-1"
                inputMode="numeric"
                value={settings.coverageDays}
                onChange={(event) => setSettings((current) => ({ ...current, coverageDays: event.target.value }))}
              />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>
              Annulla
            </Button>
            <Button type="button" disabled={settingsMutation.isPending} onClick={() => settingsMutation.mutate()}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rettifica di magazzino</DialogTitle>
            <DialogDescription>
              La rettifica non cambia il conteggio già registrato: viene aggiunta allo storico con il motivo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm">
              Zona
              <Select
                value={adjust.locationId}
                onValueChange={(value) => setAdjust((current) => ({ ...current, locationId: value }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Zona" />
                </SelectTrigger>
                <SelectContent>
                  {(overview?.locations ?? []).map((row) => (
                    <SelectItem key={row.location_id} value={row.location_id}>
                      {row.location_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block text-sm">
              Quantità (positiva o negativa)
              <Input
                className="mt-1"
                inputMode="decimal"
                placeholder="-2 oppure 5"
                value={adjust.quantity}
                onChange={(event) => setAdjust((current) => ({ ...current, quantity: event.target.value }))}
              />
            </label>
            <label className="block text-sm">
              Motivo
              <Input
                className="mt-1"
                value={adjust.reason}
                onChange={(event) => setAdjust((current) => ({ ...current, reason: event.target.value }))}
                placeholder="Merce deteriorata"
              />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAdjustOpen(false)}>
              Annulla
            </Button>
            <Button type="button" disabled={adjustMutation.isPending} onClick={() => adjustMutation.mutate()}>
              Registra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
