import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Item = { id: string; title: string; body: string | null; link: string | null; created_at: string; read: boolean };

const fmt = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function NotificationBell({ companyId, className }: { companyId: string | null | undefined; className?: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"nuove" | "storico">("nuove");
  const key = ["notifications", companyId];

  const query = useQuery({
    queryKey: key,
    enabled: !!companyId,
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase.from("notifications").select("id,title,body,link,created_at").eq("company_id", companyId!).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      const ids = (data ?? []).map((n) => n.id);
      const reads = ids.length ? await supabase.from("notification_reads").select("notification_id,dismissed_at").in("notification_id", ids) : { data: [] as { notification_id: string; dismissed_at: string | null }[] };
      const readSet = new Set<string>();
      const dismissed = new Set<string>();
      for (const r of reads.data ?? []) { readSet.add(r.notification_id); if (r.dismissed_at) dismissed.add(r.notification_id); }
      return (data ?? []).filter((n) => !dismissed.has(n.id)).map((n) => ({ ...n, read: readSet.has(n.id) }));
    },
  });

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase.channel(`notifications-${companyId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `company_id=eq.${companyId}` }, () => { void qc.invalidateQueries({ queryKey: ["notifications", companyId] }); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [companyId, qc]);

  const items = query.data ?? [];
  const unread = items.filter((i) => !i.read);
  const history = items.filter((i) => i.read);
  const shown = tab === "nuove" ? unread : history;

  async function markRead(ids: string[] | null) {
    await supabase.rpc("mark_notifications_read", ids ? { _ids: ids } : {});
    await qc.invalidateQueries({ queryKey: key });
  }
  async function dismiss(ids: string[]) {
    if (!ids.length) return;
    await supabase.rpc("dismiss_notifications", { _ids: ids });
    await qc.invalidateQueries({ queryKey: key });
  }
  function openItem(n: Item) {
    if (!n.read) void markRead([n.id]);
    if (n.link) { setOpen(false); void navigate({ to: n.link }); }
  }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="icon" aria-label={`Notifiche${unread.length ? `: ${unread.length} non lette` : ""}`} className={cn("relative", className)}>
        <Bell className="h-5 w-5" />
        {unread.length ? <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">{unread.length > 99 ? "99+" : unread.length}</span> : null}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 p-0">
      <div className="border-b border-border px-3 pt-2">
        <p className="text-sm font-semibold">Notifiche</p>
        <div className="mt-2 flex gap-1">
          {(["nuove", "storico"] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={cn("border-b-2 px-2 pb-1.5 text-xs font-medium", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}>{t === "nuove" ? `Nuove (${unread.length})` : `Storico (${history.length})`}</button>)}
        </div>
      </div>
      {shown.length ? <div className="flex justify-end gap-3 border-b border-border px-3 py-1.5">
        {tab === "nuove" ? <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => void markRead(unread.map((i) => i.id))}>Segna tutte come lette</Button> : null}
        <Button variant="link" size="sm" className="h-auto p-0 text-xs text-destructive" onClick={() => { if (window.confirm(`Cancellare ${shown.length} notifiche?`)) void dismiss(shown.map((i) => i.id)); }}>Cancella tutte</Button>
      </div> : null}
      <div className="max-h-96 overflow-y-auto">
        {shown.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">{tab === "nuove" ? "Nessuna nuova notifica" : "Nessuna notifica nello storico"}</p> : shown.map((n) =>
          <div key={n.id} className="flex items-start gap-1 border-b border-border last:border-0 hover:bg-muted">
            <button type="button" onClick={() => openItem(n)} className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm", !n.read && "font-semibold")}>{n.title}</span>
                {n.body ? <span className="block text-xs text-muted-foreground">{n.body}</span> : null}
                <span className="block text-[11px] text-muted-foreground">{fmt.format(new Date(n.created_at))}</span>
              </span>
            </button>
            <Button variant="ghost" size="icon" className="mt-1 h-7 w-7 shrink-0" aria-label="Cancella notifica" onClick={() => void dismiss([n.id])}><X className="h-3.5 w-3.5" /></Button>
          </div>)}
      </div>
    </PopoverContent>
  </Popover>;
}
