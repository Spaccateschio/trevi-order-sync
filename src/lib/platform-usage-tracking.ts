import { supabase } from "@/integrations/supabase/client";
import { recordPlatformUsageEvent } from "@/lib/platform-usage.functions";
import {
  getPlatformUsagePage,
  type PlatformUsageDevice,
  type PlatformUsageEventType,
  type PlatformUsagePageKey,
} from "@/lib/platform-usage";

const VISIT_STORAGE_KEY = "trevi-platform-usage-visit";

function visitId(): string | null {
  try {
    const existing = window.sessionStorage.getItem(VISIT_STORAGE_KEY);
    if (existing) return existing;
    const created = window.crypto.randomUUID();
    window.sessionStorage.setItem(VISIT_STORAGE_KEY, created);
    return created;
  } catch {
    return null;
  }
}

function device(): PlatformUsageDevice {
  return window.innerWidth < 768 ? "smartphone" : "computer";
}

export function trackPlatformUsageEvent(
  eventType: PlatformUsageEventType,
  pageKey: PlatformUsagePageKey,
  options: { elementKey?: string; metricValue?: number } = {},
): void {
  if (typeof window === "undefined") return;
  const currentVisit = visitId();
  if (!currentVisit) return;
  const elementKey = options.elementKey ?? null;
  const metricValue = options.metricValue ?? null;

  void supabase.auth.getSession()
    .then(({ data }) => {
      if (!data.session) return null;
      return recordPlatformUsageEvent({
        data: { eventType, pageKey, elementKey, device: device(), visitId: currentVisit, metricValue },
      });
    })
    .catch(() => {
      // La statistica non deve mai interrompere o rallentare il lavoro dell'utente.
    });
}

export function trackPlatformUsageClick(pageKey: PlatformUsagePageKey, elementKey: string): void {
  trackPlatformUsageEvent("click", pageKey, { elementKey });
}

export function trackPlatformUsageError(pathname: string): void {
  const page = getPlatformUsagePage(pathname);
  if (page) trackPlatformUsageEvent("error", page.key);
}
