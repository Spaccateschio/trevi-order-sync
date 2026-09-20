import {
  Boxes,
  Building2,
  ClipboardList,
  LayoutDashboard,
  Link2,
  Package,
  PlugZap,
  ReceiptText,
  ShoppingBasket,
  ShoppingCart,
  Store,
  Truck,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import {
  companyBuys,
  companySells,
  hasRole,
  type AppRole,
  type Identity,
} from "@/hooks/use-identity";

/**
 * Chiave stabile di modulo: in una fase successiva i permessi personalizzati
 * si aggancieranno a queste chiavi senza riscrivere il menu.
 */
export type ModuleKey =
  | "comune.panoramica"
  | "comune.azienda"
  | "comune.collegamenti"
  | "comune.account"
  | "acquisti.panoramica"
  | "acquisti.catalogo"
  | "acquisti.lista-spesa"
  | "acquisti.ordini"
  | "acquisti.inventario"
  | "acquisti.fornitori"
  | "vendite.panoramica"
  | "vendite.clienti"
  | "vendite.prodotti"
  | "vendite.gestionale"
  | "vendite.preparazione"
  | "vendite.consegne";

export type NavArea = "comune" | "acquisti" | "vendite";

export type NavItem = {
  key: ModuleKey;
  area: NavArea;
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
  /** Ruoli che vedono il modulo; vuoto = tutti i membri dell'azienda. */
  roles?: AppRole[];
};

export const NAV_ITEMS: NavItem[] = [
  {
    key: "comune.panoramica",
    area: "comune",
    to: "/dashboard",
    label: "Panoramica",
    short: "Home",
    icon: LayoutDashboard,
  },
  {
    key: "comune.collegamenti",
    area: "comune",
    to: "/collegamenti",
    label: "Collegamenti",
    short: "Collegam.",
    icon: Link2,
  },
  {
    key: "acquisti.panoramica",
    area: "acquisti",
    to: "/acquisti",
    label: "Acquisti",
    short: "Acquisti",
    icon: ShoppingBasket,
  },
  {
    key: "acquisti.catalogo",
    area: "acquisti",
    to: "/acquisti/catalogo",
    label: "Catalogo",
    short: "Catalogo",
    icon: Package,
  },
  {
    key: "acquisti.lista-spesa",
    area: "acquisti",
    to: "/acquisti/lista-spesa",
    label: "Lista della Spesa",
    short: "Spesa",
    icon: ShoppingCart,
  },
  {
    key: "acquisti.inventario",
    area: "acquisti",
    to: "/acquisti/inventario",
    label: "Inventario",
    short: "Invent.",
    icon: Boxes,
  },
  {
    key: "acquisti.fornitori",
    area: "acquisti",
    to: "/acquisti/fornitori",
    label: "Fornitori",
    short: "Fornitori",
    icon: Store,
  },
  {
    key: "vendite.panoramica",
    area: "vendite",
    to: "/vendite",
    label: "Vendite",
    short: "Vendite",
    icon: ReceiptText,
  },
  {
    key: "vendite.clienti",
    area: "vendite",
    to: "/vendite/clienti",
    label: "Clienti",
    short: "Clienti",
    icon: Store,
  },
  {
    key: "vendite.prodotti",
    area: "vendite",
    to: "/vendite/prodotti",
    label: "Prodotti",
    short: "Prodotti",
    icon: Package,
  },
  {
    key: "vendite.preparazione",
    area: "vendite",
    to: "/operativo",
    label: "Preparazione",
    short: "Lavoro",
    icon: ClipboardList,
    roles: ["amministratore", "operatore"],
  },
  {
    key: "vendite.consegne",
    area: "vendite",
    to: "/consegne",
    label: "Consegne",
    short: "Consegne",
    icon: Truck,
    roles: ["amministratore", "trasportatore"],
  },
  {
    key: "vendite.gestionale",
    area: "vendite",
    to: "/danea",
    label: "Gestionale",
    short: "Danea",
    icon: PlugZap,
    roles: ["amministratore"],
  },
  {
    key: "comune.azienda",
    area: "comune",
    to: "/amministrazione",
    label: "Azienda",
    short: "Azienda",
    icon: Building2,
    roles: ["amministratore"],
  },
  {
    key: "comune.account",
    area: "comune",
    to: "/account",
    label: "Account",
    short: "Account",
    icon: UserRound,
  },
];

/** Unico punto di calcolo della visibilità: capacità dell'azienda + ruolo. */
export function canSeeModule(identity: Identity | null | undefined, item: NavItem) {
  if (item.area === "acquisti" && !companyBuys(identity)) return false;
  if (item.area === "vendite" && !companySells(identity)) return false;
  if (item.roles && !item.roles.some((role) => hasRole(identity, role))) return false;
  return true;
}

export function visibleNavItems(identity: Identity | null | undefined) {
  return NAV_ITEMS.filter((item) => canSeeModule(identity, item));
}
