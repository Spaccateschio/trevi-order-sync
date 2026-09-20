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
};

export const MOCK_PRODUCTS: MockProduct[] = [
  { id: "mele", name: "Mele Golden", code: "0246", unit: "kg", calculated: 120, favorite: true, icon: "🍏" },
  { id: "pomodori", name: "Pomodori", code: "0247", unit: "kg", calculated: 85, favorite: true, icon: "🍅" },
  { id: "lattuga", name: "Lattuga", code: "0255", unit: "pz", calculated: 40, favorite: true, icon: "🥬" },
  { id: "carote", name: "Carote", code: "0312", unit: "kg", calculated: 60, favorite: true, icon: "🥕" },
  { id: "zucchine", name: "Zucchine", code: "0433", unit: "kg", calculated: 35, favorite: true, icon: "🥒" },
  { id: "melanzane", name: "Melanzane", code: "0446", unit: "kg", calculated: 100, favorite: false, icon: "🍆" },
  { id: "limoni", name: "Limoni", code: "0510", unit: "kg", calculated: 48, favorite: false, icon: "🍋" },
  { id: "patate", name: "Patate novelle", code: "0612", unit: "kg", calculated: 72, favorite: false, icon: "🥔" },
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