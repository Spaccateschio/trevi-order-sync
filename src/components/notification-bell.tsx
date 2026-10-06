import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Item = { id: string; title: string; body: string | null; link: string | null; created_at: string; read: boolean };

const fmt = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

export function NotificationBell({ companyId, className }: { companyId: string | null | undefined; className?: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const key = ["notifications", companyId];

  const query = useQuery({
    queryKey: key,
    enabled: !!companyId,
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase.from("notifications").select("id,title,body,link,created_at").eq("company_id", companyId!).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      const ids = (data ?? []).map((n) => n.id);
      const reads = ids.length ? await supabase.from("notification_reads").select("notification_id").in("notification_id", ids) : { data: [] as { notification_id: string }[] };
      const readSet = new Set((reads.data ?? []).map((r) => r.notification_id));
      return (data ?? []).map((n) => ({ ...n, read: readSet.has(n.id) }));
    },
  });

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase.channel(`notifications-${companyId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `company_id=eq.${companyId}` }, () => { void qc.invalidateQueries({ queryKey: ["notifications", companyId] }); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [companyId, qc]);

  const items = query.data ?? [];
  const unread = items.filter((i) => !i.read).length;

  async function markRead(ids: string[] | null) {
    await supabase.rpc("mark_notifications_read", { _ids: ids ?? undefined });
    await qc.invalidateQueries({ queryKey: key });
  }

  return <Popover>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="icon" aria-label={`Notifiche${unread ? `: ${unread} non lette` : ""}`} className={cn("relative", className)}>
        <Bell className="h-5 w-5" />
        {unread ? <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">{unread > 99 ? "99+" : unread}</span> : null}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 p-0">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-sm font-semibold">Notifiche</p>
        {unread ? <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => void markRead(null)}>Segna tutte come lette</Button> : null}
      </div>
      <div className="max-h-96 overflow-y-auto">
        {items.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nessuna notifica</p> : items.map((n) =>
          <button key={n.id} type="button" onClick={() => { if (!n.read) void markRead([n.id]); if (n.link) void navigate({ to: n.link }); }} className="flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted">
            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm", !n.read && "font-semibold")}>{n.title}</span>
              {n.body ? <span className="block text-xs text-muted-foreground">{n.body}</span> : null}
              <span className="block text-[11px] text-muted-foreground">{fmt.format(new Date(n.created_at))}</span>
            </span>
          </button>)}
      </div>
    </PopoverContent>
  </Popover>;
}
