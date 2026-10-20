import { useEffect, useRef, type ReactNode } from "react";
import { Pencil, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** One mounted set of existing controls. Opening/closing never invokes a persistence callback. */
export function ShoppingMobileCard({ id, name, open, onToggle, header, summary, supplier, suggested, warnings, children, locked, recheck, busy }: {
  id: string; name: string; open: boolean; onToggle: () => void;
  header: ReactNode; summary: ReactNode; supplier: ReactNode; suggested: ReactNode;
  warnings: ReactNode; children: ReactNode; locked: boolean; recheck: boolean; busy: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const reveal = () => {
      const card = ref.current;
      if (!card) return;
      const active = document.activeElement;
      const input = active instanceof HTMLElement && card.contains(active) ? active : card.querySelector<HTMLElement>("input:not(:disabled)");
      const box = (input ?? card).getBoundingClientRect();
      const top = (viewport?.offsetTop ?? 0) + 76;
      // Leave space for the existing fixed navigation and the inline Confirm control.
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 160;
      const delta = box.top < top ? box.top - top : box.bottom > bottom ? box.bottom - bottom : 0;
      if (delta) window.scrollBy({ top: delta, behavior: "instant" });
    };
    const frame = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ block: "start", behavior: "instant" });
      ref.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus({ preventScroll: true });
      reveal();
    });
    viewport?.addEventListener("resize", reveal);
    viewport?.addEventListener("scroll", reveal);
    ref.current?.addEventListener("focusin", reveal);
    const element = ref.current;
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", reveal);
      viewport?.removeEventListener("scroll", reveal);
      element?.removeEventListener("focusin", reveal);
    };
  }, [open]);

  return <article ref={ref} id={`item-${id}`} data-mobile-card data-open={open} className={cn("min-w-0 scroll-mt-20 rounded-md border-2 border-border bg-card p-2.5", locked && "border-primary/60 bg-primary/15", recheck && "border-warning bg-warning/10", open && "border-primary")}>
    {header}
    {warnings}
    <Button type="button" variant="ghost" disabled={busy} onClick={onToggle} aria-expanded={open} aria-controls={`mobile-details-${id}`} aria-label={`${open ? "Chiudi" : "Apri"} quantità di ${name}`}
      className="mt-1.5 h-auto min-h-9 w-full justify-between gap-2 rounded-sm bg-muted px-2 py-1.5 text-left whitespace-normal">
      <span className="min-w-0 flex-1">{summary}</span>
      {open ? <ChevronUp className="size-4 shrink-0 text-muted-foreground" /> : <Pencil className="size-4 shrink-0 text-muted-foreground" />}
    </Button>
    <div className="mt-1 flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-xs text-muted-foreground">{supplier}{suggested}</div>
    {open ? <div id={`mobile-details-${id}`} className="mt-2 space-y-2">{children}</div> : null}
  </article>;
}