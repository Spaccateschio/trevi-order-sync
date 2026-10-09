import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

type PreviewList = { list_id: string; name: string; number: string | null; status?: string };
type UnitWarning = { list_id: string; list_name: string; list_number: string | null; item_id: string; product_name: string | null; unit_code: string | null };
type Preview = { blocked_lists: PreviewList[]; warning_lists: PreviewList[]; unit_warnings: UnitWarning[] };

const listLabel = (l: { name: string; number: string | null }) => (l.number ? `${l.number} · ${l.name}` : l.name);

/**
 * «Scollega dal prodotto»: disattiva SOLO il collegamento Prodotto ↔ Fornitore (mai ripartizioni, quantità o U.M.).
 * L'anteprima (unlink_supplier_preview) serve solo a scegliere cosa mostrare; il blocco vero lo decide il database.
 */
export function UnlinkSupplierDialog({
  companyId,
  linkId,
  supplierName,
  mode,
  onClose,
  onDone,
}: {
  companyId: string;
  linkId: string | null;
  supplierName: string;
  /** "product" = scheda prodotto / card della Lista; "b2b" = Catalogo. */
  mode: "product" | "b2b";
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const open = linkId !== null;
  const preview = useQuery({
    queryKey: ["unlink-supplier-preview", companyId, linkId],
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("unlink_supplier_preview", { _company_id: companyId, _link_id: linkId! });
      if (error) throw new Error(error.message);
      return data as unknown as Preview;
    },
  });

  const unlink = useMutation({
    mutationFn: async () => {
      const { error } =
        mode === "b2b"
          ? await supabase.rpc("unlink_b2b_catalog_item", { _company_id: companyId, _link_id: linkId! })
          : await supabase.rpc("unlink_product_supplier", { _company_id: companyId, _link_id: linkId! });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success(`${supplierName} scollegato dal prodotto`);
      await onDone();
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      void preview.refetch();
    },
  });

  const data = preview.data;
  const blocked = data?.blocked_lists ?? [];
  const confirmed = blocked.some((l) => l.status === "confermata");
  const warnings = data?.warning_lists ?? [];
  const units = data?.unit_warnings ?? [];
  const hasWarning = warnings.length > 0 || units.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o && !unlink.isPending) onClose(); }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{blocked.length ? `Non puoi scollegare ${supplierName}` : `Scollegare ${supplierName} dal prodotto?`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left text-sm">
              {preview.isLoading ? <p>Controllo delle Liste in corso…</p> : null}
              {preview.error ? <p className="text-destructive">{(preview.error as Error).message}</p> : null}
              {data && blocked.length ? (
                <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-foreground">
                  <p className="flex items-start gap-1.5 font-medium">
                    <Ban className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                    {confirmed
                      ? "La Lista è confermata: il fornitore potrà essere scollegato dopo la chiusura della Lista."
                      : "Togli prima il fornitore da questa Lista: ha una ripartizione salvata."}
                  </p>
                  <ul className="list-disc pl-6 text-xs">
                    {blocked.map((l) => (
                      <li key={l.list_id}>
                        {listLabel(l)} · {l.status === "confermata" ? "confermata" : "aperta"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {data && !blocked.length ? (
                <>
                  <p>Il collegamento viene disattivato. Ripartizioni, quantità e U.M. delle Liste restano invariate; lo storico resta intatto.</p>
                  {warnings.length ? (
                    <p className="flex items-start gap-1.5 rounded-md border border-warning/50 bg-warning/10 p-2 text-foreground">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden="true" />
                      <span>
                        Il fornitore sparirà dalla card del prodotto nelle Liste aperte: {warnings.map(listLabel).join(", ")}. Nessun ordine è coinvolto.
                      </span>
                    </p>
                  ) : null}
                  {units.length ? (
                    <p className="flex items-start gap-1.5 rounded-md border border-warning/50 bg-warning/10 p-2 text-foreground">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden="true" />
                      <span>
                        Su {units.length} {units.length === 1 ? "riga" : "righe"} l'U.M. scelta non è più offerta da nessun fornitore:{" "}
                        {units.map((u) => `${listLabel({ name: u.list_name, number: u.list_number })} · ${u.product_name ?? "prodotto"} · ${u.unit_code ?? "—"}`).join("; ")}. Andrà cambiata a mano.
                      </span>
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={unlink.isPending}>{blocked.length ? "Chiudi" : "Annulla"}</AlertDialogCancel>
          {data && !blocked.length ? (
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={unlink.isPending}
              onClick={(ev) => { ev.preventDefault(); unlink.mutate(); }}
            >
              {hasWarning ? "Scollega comunque" : "Scollega"}
            </AlertDialogAction>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
