import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  PackageSearch,
  PlugZap,
  ReceiptText,
  ShoppingBasket,
  Store,
  Truck,
  UserRound,
  Users,
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
  | "comune.account"
  | "acquisti.panoramica"
  | "acquisti.fornitori"
  | "vendite.panoramica"
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
    key: "acquisti.panoramica",
    area: "acquisti",
    to: "/acquisti",
    label: "Acquisti",
    short: "Acquisti",
    icon: ShoppingBasket,
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

export const UNUSED_ICONS = { PackageSearch, Users };
