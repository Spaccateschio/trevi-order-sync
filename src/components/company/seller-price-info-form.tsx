import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PRICE_INFO_TEXT, formatPriceUpdate } from "@/lib/price-info";

/** Orario abituale (solo informativo) e testo prezzi mostrato ai clienti. */
export function SellerPriceInfoForm({ companyId, isAdmin }: { companyId: string; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const key = ["seller-price-info-settings", companyId];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_price_info")
        .select("usual_update_time, info_text, last_price_update_at, last_price_update_source")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const [time, setTime] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTime(query.data?.usual_update_time?.slice(0, 5) ?? "");
    setText(query.data?.info_text ?? "");
  }, [query.data]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("set_seller_price_info", {
      _company_id: companyId,
      _usual_update_time: (time || null) as string,
      _info_text: (text.trim() || null) as string,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Impostazioni prezzi salvate.");
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["seller-price-info", companyId] });
  };

  const last = query.data?.last_price_update_at;
  return (
    <section className="mt-4 rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <h2 className="font-display text-sm font-semibold sm:text-base">Prezzi di vendita ai clienti</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Ultimo aggiornamento reale del listino:{" "}
        {last
          ? `${formatPriceUpdate(last)} (${query.data?.last_price_update_source === "manuale" ? "modifica manuale" : "invio da Danea"})`
          : "non ancora registrato"}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="grid gap-1">
          <Label htmlFor="usual-price-time">Orario abituale di aggiornamento</Label>
          <Input
            id="usual-price-time"
            type="time"
            value={time}
            disabled={!isAdmin}
            onChange={(e) => setTime(e.target.value)}
          />
          <span className="text-[11px] text-muted-foreground">Facoltativo, solo informativo.</span>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="price-info-text">Testo mostrato ai clienti</Label>
          <Textarea
            id="price-info-text"
            value={text}
            disabled={!isAdmin}
            maxLength={500}
            placeholder={DEFAULT_PRICE_INFO_TEXT}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      </div>
      {isAdmin ? (
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={save} disabled={saving}>
            Salva
          </Button>
        </div>
      ) : null}
    </section>
  );
}
