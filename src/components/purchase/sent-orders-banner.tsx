import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type SentOrder = { id: string; number: string | null; sent_at: string; supplier: string | null };

const DISMISS_KEY = "sent-orders-banner-dismissed";
const WINDOW_HOURS = 12;

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    const parsed = raw ? (JSON.parse(raw) as { ids?: string[]; at?: number }) : null;
    if (!parsed?.ids || !parsed.at || Date.now() - parsed.at > WINDOW_HOURS * 3600 * 1000) return new Set();
    return new Set(parsed.ids);
  } catch {
    return new Set();
  }
}

/**
 * Un solo banner sottile che scorre con l'ultimo ordine inviato dalla Lista della Spesa.
 * La freccia apre l'elenco degli altri ordini; la ✕ lo chiude (scelta salvata sul dispositivo).
 */
export function SentOrdersBanner({ companyId, measuredScroll = false }: { companyId: string; measuredScroll?: boolean }) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : readDismissed()));
  const [open, setOpen] = useState(false);

  const ordersQuery = useQuery({
    queryKey: ["sent-orders-banner", companyId],
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, number, sent_at, supplier_records(legal_name)")
        .eq("company_id", companyId)
        .eq("status", "inviato")
        .not("sent_at", "is", null)
        .gte("sent_at", since)
        .order("sent_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id as string,
        number: (row.number as string | null) ?? null,
        sent_at: row.sent_at as string,
        supplier: (row.supplier_records as { legal_name: string } | null)?.legal_name ?? null,
      })) as SentOrder[];
    },
  });

  const orders = useMemo(() => (ordersQuery.data ?? []).filter((order) => !dismissed.has(order.id)), [ordersQuery.data, dismissed]);

  useEffect(() => {
    if (!orders.length) setOpen(false);
  }, [orders.length]);

  const first = orders[0];
  if (!first) return null;
  const rest = orders.slice(1);
  const label = (order: SentOrder) =>
    `Ordine ${order.number ?? ""} inviato${order.supplier ? ` a ${order.supplier}` : ""}`;

  const dismissAll = () => {
    const next = new Set([...dismissed, ...orders.map((order) => order.id)]);
    setDismissed(next);
    try {
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify({ ids: [...next], at: Date.now() }));
    } catch {
      /* dispositivo senza spazio: il banner ricompare e basta */
    }
  };

  return (
    <div className="rounded-md border border-success/50 bg-success/10 text-foreground" role="status">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <Send className="size-4 shrink-0 text-success" aria-hidden="true" />
        {measuredScroll ? <MeasuredOrderText text={label(first)} /> : <div className="relative min-w-0 flex-1 overflow-hidden">
          <Link
            to="/acquisti/ordini"
            className="marquee inline-block whitespace-nowrap text-xs font-semibold hover:underline"
            title="Vai all'ordine"
          >
            {label(first)}
          </Link>
        </div>}
        {rest.length > 0 ? (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 gap-0.5 px-1.5 text-xs font-semibold"
                aria-label={open ? "Nascondi gli altri ordini inviati" : `Mostra gli altri ${rest.length} ordini inviati`}
              >
                +{rest.length}
                <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 px-0 text-muted-foreground"
          aria-label="Chiudi l'avviso degli ordini inviati"
          onClick={dismissAll}
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      {rest.length > 0 ? (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleContent className="border-t border-success/30 px-2 py-1">
            <ul className="space-y-0.5">
              {rest.map((order) => (
                <li key={order.id}>
                  <Link to="/acquisti/ordini" className="block truncate text-xs font-semibold hover:underline">
                    {label(order)}
                  </Link>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

function MeasuredOrderText({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLAnchorElement>(null);
  const [scrolling, setScrolling] = useState(false);
  const [touchPaused, setTouchPaused] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const element = textRef.current;
    if (!container || !element) return;

    const measure = () => {
      const containerWidth = container.clientWidth;
      const textWidth = element.scrollWidth;
      element.style.setProperty("--from", `${containerWidth}px`);
      element.style.setProperty("--to", `${-textWidth}px`);
      element.style.setProperty("--scroll-duration", `${(containerWidth + textWidth) / 60}s`);
      setScrolling(containerWidth > 0 && textWidth > 0);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [text]);

  return (
    <div
      ref={containerRef}
      className="sent-order-scroll relative min-w-0 flex-1 overflow-hidden"
      data-scrolling={scrolling}
      data-paused={touchPaused}
      onPointerDown={(event) => {
        if (event.pointerType === "touch" || event.pointerType === "pen") {
          event.currentTarget.setPointerCapture(event.pointerId);
          setTouchPaused(true);
        }
      }}
      onPointerUp={() => setTouchPaused(false)}
      onPointerCancel={() => setTouchPaused(false)}
      onLostPointerCapture={() => setTouchPaused(false)}
    >
      <Link
        ref={textRef}
        to="/acquisti/ordini"
        className="sent-order-scroll-text inline-block whitespace-nowrap text-xs font-semibold hover:underline"
        title="Vai all'ordine"
      >
        {text}
      </Link>
    </div>
  );
}
