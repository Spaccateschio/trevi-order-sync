import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const pageKeys = [
  "lista-spesa",
  "ordini-clienti",
  "inventario",
  "prodotti",
  "preparazione",
  "catalogo",
  "piattaforma-pannello",
  "piattaforma-aziende",
  "piattaforma-utenti",
  "piattaforma-registro",
  "piattaforma-statistiche",
] as const;

const filtersSchema = z.object({
  period: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  area: z.enum(["tutte", "aziende", "piattaforma"]),
  device: z.enum(["tutti", "smartphone", "computer"]),
  page: z.union([z.literal("tutte"), z.enum(pageKeys)]),
});

const recordSchema = z.object({
  eventType: z.enum(["page_view", "click", "page_load", "page_engagement", "error"]),
  pageKey: z.enum(pageKeys),
  elementKey: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/).nullable(),
  device: z.enum(["smartphone", "computer"]),
  visitId: z.string().uuid(),
  metricValue: z.number().min(0).max(86_400_000).nullable(),
});

const pageStatSchema = z.object({
  key: z.enum(pageKeys),
  views: z.coerce.number(),
  clicks: z.coerce.number(),
  visits: z.coerce.number(),
  errors: z.coerce.number(),
  avgLoadMs: z.coerce.number().nullable(),
  activeMs: z.coerce.number(),
  smartphoneViews: z.coerce.number(),
  computerViews: z.coerce.number(),
  smartphoneErrors: z.coerce.number(),
  computerErrors: z.coerce.number(),
  smartphoneLoadMs: z.coerce.number().nullable(),
  computerLoadMs: z.coerce.number().nullable(),
});

const snapshotSchema = z.object({
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  totals: z.object({
    views: z.coerce.number(),
    clicks: z.coerce.number(),
    visits: z.coerce.number(),
  }),
  previousTotals: z.object({ views: z.coerce.number(), clicks: z.coerce.number() }),
  daily: z.array(z.object({
    date: z.string(),
    views: z.coerce.number(),
    clicks: z.coerce.number(),
  })),
  pages: z.array(pageStatSchema),
  clickedElements: z.array(z.object({
    key: z.string(),
    pageKey: z.enum(pageKeys),
    clicks: z.coerce.number(),
    visits: z.coerce.number(),
    repeatedVisits: z.coerce.number(),
    maxClicksInVisit: z.coerce.number(),
  })),
  collectionStartedAt: z.string().nullable(),
});

export const recordPlatformUsageEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(recordSchema)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("record_platform_usage_event", {
      _event_type: data.eventType,
      _page_key: data.pageKey,
      _element_key: data.elementKey ?? "",
      _device: data.device,
      _visit_id: data.visitId,
      ...(data.metricValue !== null ? { _metric_value: data.metricValue } : {}),
    });
    if (error) throw new Error(error.message);
    return { recorded: true };
  });

export const getPlatformUsageSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(filtersSchema)
  .handler(async ({ data, context }) => {
    const { data: snapshot, error } = await context.supabase.rpc("platform_usage_snapshot", {
      _days: data.period,
      _area: data.area,
      _device: data.device,
      _page_key: data.page,
    });
    if (error) throw new Error(error.message);
    return snapshotSchema.parse(snapshot);
  });
