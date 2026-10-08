import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { it } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addDays, localToday, useDeliveryPreferences } from "@/lib/delivery-preferences";
import { setShoppingListDeliveryDate } from "@/lib/shopping-list.functions";
import type { ShoppingListRow } from "@/lib/shopping-list";

const WEEKDAY = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

/** «Sab 10/10/2026» da una data YYYY-MM-DD. */
export function listDateLabel(iso: string | null | undefined): string {
  if (!iso) return "non impostato";
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  const wd = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Alla creazione di una nuova Lista: propone la data dalla preferenza aziendale (oggi/domani), salvata solo sulla Lista. */
export function useProposeListDate(companyId: string) {
  const prefs = useDeliveryPreferences(companyId);
  const run = useServerFn(setShoppingListDeliveryDate);
  return async (listId: string) => {
    const tz = prefs.data?.timezone ?? "Europe/Rome";
    const today = localToday(tz);
    const date = prefs.data?.day === "domani" ? addDays(today, 1) : today;
    try {
      await run({ data: { companyId, listId, deliveryDate: date } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Data della lista non salvata");
    }
  };
}

/** Testata: «Per quando serve: …» con Cambia (Oggi / Domani / calendario). Modifica solo questa Lista. */
export function ListDeliveryDate({
  companyId,
  list,
  editable,
}: {
  companyId: string;
  list: ShoppingListRow;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const prefs = useDeliveryPreferences(companyId);
  const run = useServerFn(setShoppingListDeliveryDate);
  const today = localToday(prefs.data?.timezone ?? "Europe/Rome");

  const mutation = useMutation({
    mutationFn: (date: string) => run({ data: { companyId, listId: list.id, deliveryDate: date } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping-lists", companyId] });
      setOpen(false);
      toast.success("Data della lista aggiornata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selected = list.delivery_date ? new Date(`${list.delivery_date}T00:00:00`) : undefined;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Per quando serve:</span>
      <span className="font-semibold">{listDateLabel(list.delivery_date)}</span>
      {editable ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2">
              <CalendarIcon className="h-3.5 w-3.5" />
              {list.delivery_date ? "Cambia" : "Imposta"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="flex gap-2 border-b p-2">
              <Button type="button" size="sm" variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate(today)}>
                Oggi
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(addDays(today, 1))}
              >
                Domani
              </Button>
            </div>
            <Calendar
              mode="single"
              {...(selected ? { selected, defaultMonth: selected } : {})}
              onSelect={(date) => date && mutation.mutate(toIso(date))}
              locale={it}
              initialFocus
              className="pointer-events-auto p-3"
            />
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
