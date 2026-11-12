import { memo } from "react";
import { shallowPropsEqual } from "@/lib/stable-props";
import { ShoppingListCard } from "./shopping-list-card";
import { CatalogProductCard } from "./catalog-entries";

/** Versioni memorizzate delle card: ridisegno solo della card cambiata (stessi componenti e comandi). */
export const MemoShoppingListCard = memo(ShoppingListCard, (a, b) => shallowPropsEqual(a as Record<string, unknown>, b as Record<string, unknown>));
export const MemoCatalogProductCard = memo(CatalogProductCard, (a, b) => shallowPropsEqual(a as Record<string, unknown>, b as Record<string, unknown>));
