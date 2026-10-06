import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getFavoriteProductIds } from "@/lib/inventory-count.functions";
import { getProductImageUrls } from "@/lib/product-images.functions";
import type { OverviewRow } from "@/lib/shopping-list";

/** Dati di sola lettura per la Lista della Spesa: nessuna scrittura, solo presentazione. */

export type RowSupplier = {
  /** Id della ripartizione salvata. */
  id: string;
  purchaseUnitId: string | null;
  linkId: string;
  supplierRecordId: string;
  name: string;
  /** Equivalente in U.M. di magazzino; null = conversione inesistente (non è 0). */
  quantity: number | null;
  purchaseQuantity: number | null;
  purchaseUnitCode: string | null;
  notes: string | null;
  isB2B: boolean;
};

export type OrderState = "ordinato" | "in_parte" | "da_ordinare";

export type RowExtras = {
  category: string | null;
  imageUrl: string | null;
  isFavorite: boolean;
  suppliers: RowSupplier[];
  orderState: OrderState;
  /** Quantità confermata (bloccata): data/ora, null = sbloccata. */
  lockedAt: string | null;
  /** Inventario modificato dopo la conferma: la riga va ricontrollata (null = tutto a posto). */
  inventoryChangedAt: string | null;
  /** Quantità contata prima della modifica che ha sbloccato la riga. */
  inventoryPreviousQuantity: number | null;
  /** U.M. scelta per «Da acquistare»: entrambi null = U.M. del prodotto. */
  decidedUnitId: string | null;
  decidedUnitCode: string | null;
};

type AssignmentRead = {
  id: string;
  purchase_unit_id: string | null;
  item_id: string;
  product_supplier_link_id: string;
  supplier_record_id: string;
  assigned_quantity: number | null;
  purchase_quantity: number | null;
  purchase_unit_code: string | null;
  notes: string | null;
  supplier_records: { legal_name: string } | null;
};

export function useShoppingListExtras(companyId: string, listId: string | null, rows: OverviewRow[]) {
  const getImageUrls = useServerFn(getProductImageUrls);
  const readFavorites = useServerFn(getFavoriteProductIds);
  const productIds = useMemo(() => [...new Set(rows.map((row) => row.product_id))].sort(), [rows]);
  const itemIds = useMemo(() => rows.map((row) => row.item_id).sort(), [rows]);

  const productsQuery = useQuery({
    queryKey: ["shopping-extras-products", productIds],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, category").in("id", productIds);
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((row) => [row.id, row.category as string | null]));
    },
  });

  const favoritesQuery = useQuery({
    queryKey: ["shopping-extras-favorites", companyId, productIds],
    enabled: productIds.length > 0,
    // Stesso Preferito dell'Inventario: stella sul prodotto oppure sulla referenza del catalogo fornitore.
    queryFn: async () => new Set(await readFavorites({ data: { companyId, productIds } })),
  });

  const imagesQuery = useQuery({
    queryKey: ["shopping-extras-images", productIds],
    enabled: productIds.length > 0,
    staleTime: 8 * 60 * 1000,
    queryFn: async () => {
      const map = new Map<string, string>();
      for (let index = 0; index < productIds.length; index += 50) {
        const chunk = productIds.slice(index, index + 50);
        const result = await getImageUrls({ data: { productIds: chunk, thumbnail: true } });
        for (const image of result) map.set(image.productId, image.url);
      }
      return map;
    },
  });

  // Solo collegamenti B2B attivi della mia azienda come acquirente.
  const b2bQuery = useQuery({
    queryKey: ["shopping-extras-b2b", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_customer_relations")
        .select("supplier_record_id")
        .eq("buyer_company_id", companyId)
        .eq("status", "attivo")
        .not("supplier_record_id", "is", null);
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((row) => row.supplier_record_id as string));
    },
  });

  const assignmentsQuery = useQuery({
    queryKey: ["shopping-extras-assignments", listId, itemIds],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_list_item_suppliers")
        .select(
          "id, purchase_unit_id, item_id, product_supplier_link_id, supplier_record_id, assigned_quantity, purchase_quantity, purchase_unit_code, notes, supplier_records(legal_name)",
        )
        .in("item_id", itemIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AssignmentRead[];
    },
  });

  const locksQuery = useQuery({
    queryKey: ["shopping-extras-locks", listId, itemIds],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_list_items")
        .select("id, quantity_locked_at, decided_unit_id, decided_unit_code, inventory_changed_at, inventory_previous_quantity")
        .in("id", itemIds);
      if (error) throw new Error(error.message);
      return new Map(
        (data ?? []).map((row) => [
          row.id,
          {
            lockedAt: row.quantity_locked_at as string | null,
            unitId: (row.decided_unit_id as string | null) ?? null,
            unitCode: (row.decided_unit_code as string | null) ?? null,
            inventoryChangedAt: (row.inventory_changed_at as string | null) ?? null,
            inventoryPreviousQuantity:
              row.inventory_previous_quantity === null || row.inventory_previous_quantity === undefined
                ? null
                : Number(row.inventory_previous_quantity),
          },
        ]),
      );
    },
  });

  // Righe d'ordine degli ordini non annullati generati da questa lista.
  const orderedQuery = useQuery({
    queryKey: ["shopping-extras-ordered", listId],
    enabled: Boolean(listId),
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("purchase_orders")
        .select("id")
        .eq("shopping_list_id", listId!)
        .neq("status", "annullato");
      if (error) throw new Error(error.message);
      const orderIds = (orders ?? []).map((row) => row.id);
      if (!orderIds.length) return new Set<string>();
      const { data: items, error: itemsError } = await supabase
        .from("purchase_order_items")
        .select("product_id, product_supplier_link_id")
        .in("order_id", orderIds);
      if (itemsError) throw new Error(itemsError.message);
      return new Set((items ?? []).map((row) => `${row.product_id}|${row.product_supplier_link_id ?? ""}`));
    },
  });

  const extras = useMemo(() => {
    const b2b = b2bQuery.data ?? new Set<string>();
    const ordered = orderedQuery.data ?? new Set<string>();
    const byItem = new Map<string, RowSupplier[]>();
    for (const assignment of assignmentsQuery.data ?? []) {
      const list = byItem.get(assignment.item_id) ?? [];
      list.push({
        id: assignment.id,
        purchaseUnitId: assignment.purchase_unit_id,
        linkId: assignment.product_supplier_link_id,
        supplierRecordId: assignment.supplier_record_id,
        name: assignment.supplier_records?.legal_name ?? "Fornitore",
        quantity: assignment.assigned_quantity === null ? null : Number(assignment.assigned_quantity),
        purchaseQuantity: assignment.purchase_quantity === null ? null : Number(assignment.purchase_quantity),
        purchaseUnitCode: assignment.purchase_unit_code,
        notes: assignment.notes,
        isB2B: b2b.has(assignment.supplier_record_id),
      });
      byItem.set(assignment.item_id, list);
    }
    const map = new Map<string, RowExtras>();
    for (const row of rows) {
      const suppliers = byItem.get(row.item_id) ?? [];
      const hits = suppliers.filter((supplier) => ordered.has(`${row.product_id}|${supplier.linkId}`)).length;
      const orderState: OrderState =
        suppliers.length > 0 && hits === suppliers.length ? "ordinato" : hits > 0 ? "in_parte" : "da_ordinare";
      map.set(row.item_id, {
        category: productsQuery.data?.get(row.product_id) ?? null,
        imageUrl: imagesQuery.data?.get(row.product_id) ?? null,
        isFavorite: favoritesQuery.data?.has(row.product_id) ?? false,
        suppliers,
        orderState,
        lockedAt: locksQuery.data?.get(row.item_id)?.lockedAt ?? null,
        inventoryChangedAt: locksQuery.data?.get(row.item_id)?.inventoryChangedAt ?? null,
        inventoryPreviousQuantity: locksQuery.data?.get(row.item_id)?.inventoryPreviousQuantity ?? null,
        decidedUnitId: locksQuery.data?.get(row.item_id)?.unitId ?? null,
        decidedUnitCode: locksQuery.data?.get(row.item_id)?.unitCode ?? null,
      });
    }
    return map;
  }, [rows, b2bQuery.data, orderedQuery.data, assignmentsQuery.data, productsQuery.data, imagesQuery.data, favoritesQuery.data, locksQuery.data]);

  return { extras, b2bSupplierIds: b2bQuery.data ?? new Set<string>() };
}
