import type { OrderTimeline } from "./order-list-presentation";

const fmt = (iso: string) => new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Presentation only: 7 steps always shown, reached ones filled with date. */
export function OrderTimelineBar({ timeline }: { timeline: OrderTimeline }) {
  return <div className="space-y-2">
    <p className="text-sm">A che punto è: <span className="font-semibold">{timeline.currentLabel}</span>
      {timeline.notDelivered ? <span className="ml-2 rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">Non consegnato</span> : null}
      {timeline.contested ? <span className="ml-2 rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">Contestato</span> : null}</p>
    <ol className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {timeline.steps.map((s, i) => <li key={s.key} aria-current={s.current ? "step" : undefined}
        className={`flex items-center gap-2 rounded-md border p-2 text-xs sm:flex-col sm:items-start ${s.current ? "border-foreground bg-accent font-semibold" : "border-border"} ${s.reached ? "" : "text-muted-foreground"}`}>
        <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${s.color} ${s.reached ? "text-background" : "text-muted-foreground"}`}>{i + 1}</span>
        <span className="min-w-0">
          <span className="block break-words">{s.label}</span>
          <span className="block font-normal">{s.reachedAt ? fmt(s.reachedAt) : s.reached ? "Fatto" : "Non ancora"}</span>
        </span>
      </li>)}
    </ol>
  </div>;
}
