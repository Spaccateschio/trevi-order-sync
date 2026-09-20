import { useSyncExternalStore } from "react";

export type MockLocation = {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
  active: boolean;
  products: number;
  stockValue: number;
};

export type MockProduct = {
  id: string;
  name: string;
  code: string;
  unit: string;
  calculated: number;
  favorite: boolean;
  icon: string;
  locationId: string;
  category: string;
  subcategory: string;
};

export const MOCK_PRODUCTS: MockProduct[] = [
  { id: "mele", name: "Mele Golden", code: "0246", unit: "kg", calculated: 120, favorite: true, icon: "", locationId: "mandrione", category: "Frutta", subcategory: "Mele" },
  { id: "pere", name: "Pere Abate", code: "0248", unit: "kg", calculated: 64, favorite: false, icon: "", locationId: "frigo", category: "Frutta", subcategory: "Pere" },
  { id: "limoni", name: "Limoni primo fiore", code: "0510", unit: "kg", calculated: 48, favorite: false, icon: "", locationId: "mandrione", category: "Frutta", subcategory: "Agrumi" },
  { id: "pomodori-grappolo", name: "Pomodori a grappolo", code: "0247", unit: "kg", calculated: 85, favorite: true, icon: "", locationId: "mandrione", category: "Verdura", subcategory: "Pomodori" },
  { id: "pomodori-datterino", name: "Pomodori datterino", code: "0250", unit: "kg", calculated: 28, favorite: true, icon: "", locationId: "frigo", category: "Verdura", subcategory: "Pomodori" },
  { id: "lattuga", name: "Lattuga romana", code: "0255", unit: "pz", calculated: 40, favorite: true, icon: "", locationId: "frigo", category: "Verdura", subcategory: "Insalate" },
  { id: "rucola", name: "Rucola in cassetta", code: "0257", unit: "kg", calculated: 12, favorite: false, icon: "", locationId: "frigo", category: "Verdura", subcategory: "Insalate" },
  { id: "zucchine", name: "Zucchine verdi", code: "0433", unit: "kg", calculated: 35, favorite: true, icon: "", locationId: "mandrione", category: "Verdura", subcategory: "Zucchine" },
  { id: "melanzane", name: "Melanzane viola", code: "0446", unit: "kg", calculated: 100, favorite: false, icon: "", locationId: "mandrione", category: "Verdura", subcategory: "Melanzane" },
  { id: "basilico", name: "Basilico fresco", code: "0520", unit: "pz", calculated: 32, favorite: true, icon: "", locationId: "banco", category: "Erbe aromatiche", subcategory: "Basilico" },
  { id: "prezzemolo", name: "Prezzemolo liscio", code: "0521", unit: "pz", calculated: 45, favorite: false, icon: "", locationId: "banco", category: "Erbe aromatiche", subcategory: "Prezzemolo" },
  { id: "patate", name: "Patate novelle", code: "0612", unit: "kg", calculated: 72, favorite: false, icon: "", locationId: "mandrione", category: "Patate e cipolle", subcategory: "Patate" },
  { id: "cipolle", name: "Cipolle dorate", code: "0614", unit: "kg", calculated: 54, favorite: true, icon: "", locationId: "mandrione", category: "Patate e cipolle", subcategory: "Cipolle" },
  { id: "carote", name: "Carote sfuse", code: "0312", unit: "kg", calculated: 60, favorite: true, icon: "", locationId: "cella", category: "Altro", subcategory: "Radici" },
];

let locations: MockLocation[] = [
  { id: "mandrione", name: "Magazzino Mandrione", code: "001", isDefault: true, active: true, products: 124, stockValue: 12430.5 },
  { id: "frigo", name: "Frigo", code: "002", isDefault: false, active: true, products: 56, stockValue: 8210.3 },
  { id: "banco", name: "Banco", code: "003", isDefault: false, active: true, products: 37, stockValue: 2980.1 },
  { id: "cella", name: "Cella", code: "004", isDefault: false, active: true, products: 18, stockValue: 1540 },
];

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getLocations() {
  return locations;
}

export function useMockLocations() {
  return useSyncExternalStore(subscribe, getLocations, getLocations);
}

export function addMockLocation(input: { name: string; code: string }) {
  locations = [
    ...locations,
    {
      id: `zona-${Date.now()}`,
      name: input.name,
      code: input.code,
      isDefault: false,
      active: true,
      products: 0,
      stockValue: 0,
    },
  ];
  emit();
}

export function updateMockLocation(id: string, input: { name: string; code: string }) {
  locations = locations.map((location) =>
    location.id === id ? { ...location, ...input } : location,
  );
  emit();
}

export function setDefaultMockLocation(id: string) {
  locations = locations.map((location) => ({
    ...location,
    isDefault: location.id === id,
    active: location.id === id ? true : location.active,
  }));
  emit();
}

export function toggleMockLocation(id: string) {
  const target = locations.find((location) => location.id === id);
  if (!target || target.isDefault) return;
  locations = locations.map((location) =>
    location.id === id ? { ...location, active: !location.active } : location,
  );
  emit();
}