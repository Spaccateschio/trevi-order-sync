import type { Json } from '@/integrations/supabase/types';

/** Explicit changed keys only: omitted fields are never cleared or replayed. */
export function supplierLinkPatch(before: Record<string, Json | undefined>, after: Record<string, Json | undefined>): Record<string, Json> {
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => value !== undefined && value !== before[key])) as Record<string, Json>;
}