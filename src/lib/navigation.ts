import {
  Boxes,
  Building2,
  ClipboardList,
  LayoutDashboard,
  Link2,
  Package,
  PlugZap,
  ReceiptText,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Truck,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { companyBuys, companySells, hasRole, type AppRole, type Identity } from "@/hooks/use-identity";

export type NavGroupKey = "acquisti" | "vendite" | "b2b" | "impostazioni";
export type ModuleKey =
  | "panoramica"
  | "acquisti"
  | "acquisti.lista-spesa"
  | "acquisti.ordini"
  | "acquisti.inventario"
  | "acquisti.fabbisogno"
  | "acquisti.fornitori"
  | "acquisti.prodotti"
  | "acquisti.catalogo"
  | "vendite"
  | "vendite.ordini-clienti"
  | "vendite.clienti"
  | "vendite.prodotti"
  | "vendite.preparazione"
  | "vendite.consegne"
  | "b2b"
  | "b2b.collegamenti"
  | "impostazioni"
  | "impostazioni.azienda"
  | "impostazioni.magazzino"
  | "impostazioni.account"
  | "impostazioni.gestionale"
  | "impostazioni.personalizzazione";

export type NavItem = {
  key: ModuleKey;
  group?: NavGroupKey;
  to?: string;
  search?: Record<string, string>;
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
  roles?: AppRole[];
  capability?: "buys" | "sells";
  menu: boolean;
  dashboard: "main" | NavGroupKey | null;
  alwaysVisible?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "panoramica", to: "/dashboard", label: "Panoramica", short: "Home", description: "Accesso rapido alle aree di lavoro.", icon: LayoutDashboard, menu: true, dashboard: null, alwaysVisible: true },
  { key: "acquisti", group: "acquisti", to: "/acquisti", label: "Acquisti", short: "Acquisti", description: "Fornitori, ordini, inventario e fabbisogno.", icon: ShoppingBasket, capability: "buys", menu: true, dashboard: "main" },
  { key: "acquisti.lista-spesa", group: "acquisti", to: "/acquisti/lista-spesa", label: "Lista della Spesa", short: "Spesa", description: "Prepara e assegna gli acquisti ai fornitori.", icon: ShoppingCart, capability: "buys", menu: true, dashboard: "acquisti" },
  { key: "acquisti.ordini", group: "acquisti", to: "/acquisti/ordini", label: "Ordini fornitore", short: "Ordini", description: "Segui ordini, consegne e ricevute.", icon: ClipboardList, capability: "buys", menu: true, dashboard: "acquisti" },
  { key: "acquisti.inventario", group: "acquisti", to: "/acquisti/inventario", label: "Inventario", short: "Inventario", description: "Conta i prodotti per zona di magazzino.", icon: Boxes, capability: "buys", menu: true, dashboard: "acquisti" },
  { key: "acquisti.fabbisogno", group: "acquisti", to: "/acquisti/inventario", search: { sezione: "fabbisogno" }, label: "Fabbisogno", short: "Fabbisogno", description: "Consulta le quantità necessarie da acquistare.", icon: ReceiptText, capability: "buys", menu: true, dashboard: "acquisti" },
  { key: "acquisti.fornitori", group: "acquisti", to: "/acquisti/fornitori", label: "Fornitori", short: "Fornitori", description: "Gestisci anagrafiche e rapporti di fornitura.", icon: Store, capability: "buys", menu: true, dashboard: "acquisti" },
  { key: "acquisti.prodotti", group: "acquisti", to: "/acquisti/prodotti", label: "Prodotti", short: "Prodotti", description: "Gli stessi prodotti visti dal lato approvvigionamento.", icon: Package, capability: "buys", menu: true, dashboard: "acquisti" },
  { key: "acquisti.catalogo", group: "acquisti", to: "/acquisti/catalogo", label: "Catalogo fornitori", short: "Catalogo", description: "Sfoglia i prodotti dei fornitori collegati.", icon: Package, capability: "buys", menu: true, dashboard: "acquisti" },
  { key: "vendite", group: "vendite", to: "/vendite", label: "Vendite", short: "Vendite", description: "Clienti, prodotti, preparazione e consegne.", icon: ReceiptText, capability: "sells", menu: true, dashboard: "main" },
  { key: "vendite.ordini-clienti", group: "vendite", label: "Ordini clienti", short: "Ordini", description: "Funzione prevista per una fase successiva.", icon: ShoppingCart, capability: "sells", menu: false, dashboard: "vendite" },
  { key: "vendite.clienti", group: "vendite", to: "/vendite/clienti", label: "Clienti", short: "Clienti", description: "Gestisci clienti, destinazioni e collegamenti.", icon: UsersRound, capability: "sells", menu: true, dashboard: "vendite" },
  { key: "vendite.prodotti", group: "vendite", to: "/vendite/prodotti", label: "Prodotti", short: "Prodotti", description: "Consulta catalogo, listini e unità di vendita.", icon: Package, capability: "sells", menu: true, dashboard: "vendite" },
  { key: "vendite.preparazione", group: "vendite", to: "/operativo", label: "Preparazione", short: "Preparazione", description: "Area operativa di preparazione ordini.", icon: ClipboardList, capability: "sells", roles: ["amministratore", "operatore"], menu: true, dashboard: "vendite" },
  { key: "vendite.consegne", group: "vendite", to: "/consegne", label: "Consegne", short: "Consegne", description: "Consegne assegnate e relativi stati.", icon: Truck, capability: "sells", roles: ["amministratore", "trasportatore"], menu: true, dashboard: "vendite" },
  { key: "b2b", group: "b2b", to: "/b2b", label: "B2B", short: "B2B", description: "Rapporti diretti con clienti e fornitori.", icon: Link2, menu: true, dashboard: "main" },
  { key: "b2b.collegamenti", group: "b2b", to: "/collegamenti", label: "Collegamenti", short: "Collegamenti", description: "Richieste, inviti e rapporti commerciali.", icon: Link2, menu: true, dashboard: "b2b" },
  { key: "impostazioni", group: "impostazioni", to: "/impostazioni", label: "Impostazioni", short: "Impostazioni", description: "Azienda, account e configurazioni tecniche.", icon: Settings, menu: true, dashboard: "main", alwaysVisible: true },
  { key: "impostazioni.azienda", group: "impostazioni", to: "/amministrazione", label: "Azienda", short: "Azienda", description: "Dati aziendali, indirizzi e profilo di utilizzo.", icon: Building2, roles: ["amministratore"], menu: true, dashboard: "impostazioni" },
  { key: "impostazioni.magazzino", group: "impostazioni", to: "/amministrazione", search: { sezione: "magazzino" }, label: "Magazzino / Zone", short: "Magazzino", description: "Configura le zone usate dall’inventario.", icon: Boxes, roles: ["amministratore"], menu: true, dashboard: "impostazioni" },
  { key: "impostazioni.account", group: "impostazioni", to: "/account", label: "Account", short: "Account", description: "Dati personali e accesso.", icon: UserRound, menu: true, dashboard: "impostazioni" },
  { key: "impostazioni.gestionale", group: "impostazioni", to: "/danea", label: "Gestionale / Danea", short: "Danea", description: "Postazioni, archivi e collegamento al gestionale.", icon: PlugZap, roles: ["amministratore"], menu: true, dashboard: "impostazioni" },
  { key: "impostazioni.personalizzazione", group: "impostazioni", to: "/impostazioni/navigazione", label: "Personalizzazione", short: "Personalizza", description: "Scegli ordine e visibilità di menu e dashboard.", icon: SlidersHorizontal, menu: true, dashboard: "impostazioni", alwaysVisible: true },
];

export const NAV_GROUPS: { key: NavGroupKey; label: string; section: "OPERATIVITÀ" | "SISTEMA" }[] = [
  { key: "acquisti", label: "Acquisti", section: "OPERATIVITÀ" },
  { key: "vendite", label: "Vendite", section: "OPERATIVITÀ" },
  { key: "b2b", label: "B2B", section: "OPERATIVITÀ" },
  { key: "impostazioni", label: "Impostazioni", section: "SISTEMA" },
];

export function canSeeModule(identity: Identity | null | undefined, item: NavItem) {
  if (item.capability === "buys" && !companyBuys(identity)) return false;
  if (item.capability === "sells" && !companySells(identity)) return false;
  if (item.roles && !item.roles.some((role) => hasRole(identity, role))) return false;
  return true;
}

export function authorizedNavItems(identity: Identity | null | undefined) {
  return NAV_ITEMS.filter((item) => canSeeModule(identity, item));
}