import { isValidElement, useRef } from "react";

/**
 * Card della Lista memorizzate: si ridisegna solo la card i cui valori cambiano.
 * Le funzioni passate alle card devono essere stabili (useStableCallbacks), così una card
 * non ridisegnata chiama comunque la versione più recente del gestore.
 */
function valueEqual(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true;
  if (depth <= 0) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => valueEqual(value, b[index], depth - 1));
  }
  if (isValidElement(a) && isValidElement(b)) {
    return a.type === b.type && a.key === b.key
      && shallowPropsEqual(a.props as Record<string, unknown>, b.props as Record<string, unknown>, depth - 1);
  }
  return false;
}

export function shallowPropsEqual(prev: Record<string, unknown>, next: Record<string, unknown>, depth = 4): boolean {
  const keys = Object.keys(prev);
  if (keys.length !== Object.keys(next).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(next, key) && valueEqual(prev[key], next[key], depth));
}

/** Gestori stabili per chiave: l'identità non cambia, il corpo è sempre quello dell'ultimo disegno. */
export function useStableCallbacks() {
  const latest = useRef(new Map<string, (...args: never[]) => unknown>());
  const wrappers = useRef(new Map<string, (...args: never[]) => unknown>());
  return function stable<F extends ((...args: never[]) => unknown) | undefined | null>(key: string, fn: F): F {
    if (!fn) return fn;
    latest.current.set(key, fn as (...args: never[]) => unknown);
    let wrapper = wrappers.current.get(key);
    if (!wrapper) {
      wrapper = (...args: never[]) => latest.current.get(key)?.(...args);
      wrappers.current.set(key, wrapper);
    }
    return wrapper as F;
  };
}
