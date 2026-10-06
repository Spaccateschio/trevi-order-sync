import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

/** Telefono aziendale: è il numero che i clienti chiamano dal pulsante «Chiama il fornitore». */
export function CompanyPhoneForm({ companyId, isAdmin }: { companyId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["company-phone", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("phone").eq("id", companyId).maybeSingle();
      if (error) throw new Error(error.message);
      return data?.phone ?? "";
    },
  });
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setPhone(q.data ?? ""), [q.data]);

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("companies").update({ phone: phone.trim() || null }).eq("id", companyId);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Telefono salvato");
    await qc.invalidateQueries({ queryKey: ["company-phone", companyId] });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:col-span-2">
      <h2 className="font-display text-base font-semibold">Telefono per gli ordini</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        I clienti lo vedono nel pulsante «Chiama il fornitore» quando un ordine è già preso in carico. Se lo lasci vuoto il pulsante non compare.
      </p>
      <div className="mt-3 flex gap-2 sm:max-w-md">
        <Input aria-label="Telefono per gli ordini" inputMode="tel" value={phone} disabled={!isAdmin} onChange={(e) => setPhone(e.target.value)} />
        {isAdmin ? (
          <Button disabled={busy || phone === (q.data ?? "")} onClick={save}>Salva</Button>
        ) : null}
      </div>
    </section>
  );
}
