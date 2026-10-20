import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Bell, BellOff, Check, CheckCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { markPlatformNotificationsRead, platformNotificationDemoData, platformRequestLabels, type PlatformNotification } from "./platform-notification-demo-data";

const dateFormat = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Rome",
});

type BellProps = {
  items: readonly PlatformNotification[];
  onMarkRead: (ids: string[]) => void;
  onOpenNotification: (notification: PlatformNotification) => void;
};

/** Presentation only: callers own items, read actions and navigation. */
export function PlatformNotificationBell({ items, onMarkRead, onOpenNotification }: BellProps) {
  const [open, setOpen] = useState(false);
  const unread = items.filter((item) => !item.read);
  const history = items.filter((item) => item.read);

  function openNotification(item: PlatformNotification) {
    onMarkRead([item.id]);
    setOpen(false);
    onOpenNotification(item);
  }

  function list(rows: readonly PlatformNotification[], empty: string) {
    return rows.length ? <ul className="divide-y divide-border">
      {rows.map((item) => <li key={item.id} className="px-4 py-3">
        <div className="flex items-start gap-2">
          <span aria-hidden className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-accent")} />
          <div className="min-w-0 flex-1 space-y-2">
            <Button variant="ghost" onClick={() => openNotification(item)} className="h-auto min-h-9 w-full justify-between whitespace-normal p-0 text-left hover:bg-transparent hover:text-primary">
              <span className={cn("min-w-0 break-words text-sm", !item.read && "font-semibold")}>{item.title}</span>
              <ArrowUpRight className="shrink-0 text-muted-foreground" aria-hidden />
            </Button>
            <p className="break-words text-xs leading-relaxed text-muted-foreground">{item.body}</p>
            {item.linkedRequest && <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Stato richiesta</span>
              <Badge variant="outline" className="text-[11px] font-medium">{platformRequestLabels[item.linkedRequest.status]}</Badge>
            </div>}
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <time dateTime={item.createdAt} className="text-[11px] text-muted-foreground">{dateFormat.format(new Date(item.createdAt))}</time>
              {item.read ? <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Check className="h-3 w-3" aria-hidden />Letta</span> :
                <Button variant="ghost" size="sm" className="h-9 px-2 text-xs" onClick={() => onMarkRead([item.id])}><Check className="h-3.5 w-3.5" aria-hidden />Segna come letta</Button>}
            </div>
          </div>
        </div>
      </li>)}
    </ul> : <div className="flex flex-col items-center gap-2 px-4 py-10 text-muted-foreground"><BellOff className="h-6 w-6" aria-hidden /><p className="text-sm">{empty}</p></div>;
  }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="icon" title="Notifiche piattaforma — anteprima" aria-label={`Notifiche piattaforma: ${unread.length} non lette (anteprima)`} className="relative h-11 w-11 shrink-0 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
        <Bell className="h-5 w-5" aria-hidden />
        {unread.length > 0 && <span aria-hidden className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">{unread.length > 99 ? "99+" : unread.length}</span>}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} collisionPadding={12} aria-label="Notifiche piattaforma — anteprima" className="flex max-h-[min(640px,var(--radix-popover-content-available-height))] w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Notifiche piattaforma</h2><Badge variant="secondary" className="px-1.5 text-[10px]">Anteprima</Badge></div>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Chiudi notifiche" onClick={() => setOpen(false)}><X aria-hidden /></Button>
      </div>
      <p className="border-b border-border bg-muted/50 px-4 py-2 text-xs text-muted-foreground">Solo dati dimostrativi · Nessun evento reale</p>
      <Tabs defaultValue="nuove" className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 pt-3"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="nuove">Nuove ({unread.length})</TabsTrigger><TabsTrigger value="storico">Storico ({history.length})</TabsTrigger></TabsList></div>
        <TabsContent value="nuove" className="mt-0 min-h-0 overflow-y-auto">
          {unread.length > 0 && <div className="flex justify-end border-b border-border px-4 py-1"><Button variant="ghost" size="sm" className="h-10 text-xs" onClick={() => onMarkRead(unread.map((item) => item.id))}><CheckCheck aria-hidden />Segna tutte come lette</Button></div>}
          {list(unread, "Nessuna nuova notifica")}
        </TabsContent>
        <TabsContent value="storico" className="mt-0 min-h-0 overflow-y-auto">{list(history, "Nessuna notifica nello storico")}</TabsContent>
      </Tabs>
    </PopoverContent>
  </Popover>;
}

/** Demo state is memory-only; there are no service subscriptions or queries. */
export function PlatformNotificationBellMockup({ showSellRequests }: { showSellRequests: boolean }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<PlatformNotification[]>(() => platformNotificationDemoData.map((item) => ({ ...item })));
  return <PlatformNotificationBell
    items={showSellRequests ? items : []}
    onMarkRead={(ids) => setItems((current) => markPlatformNotificationsRead(current, ids))}
    onOpenNotification={(item) => { void navigate({ to: item.destination }); }}
  />;
}