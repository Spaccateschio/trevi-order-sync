import { CheckCircle2, Pencil, Plus, Power } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  addMockLocation,
  setDefaultMockLocation,
  toggleMockLocation,
  updateMockLocation,
  useMockLocations,
  type MockLocation,
} from "@/lib/inventory-mock";

export function MockCompanyLocations() {
  const locations = useMockLocations();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MockLocation | null>(null);
  const [draft, setDraft] = useState({ name: "", code: "" });

  const startCreate = () => {
    setEditing(null);
    setDraft({ name: "", code: String(locations.length + 1).padStart(3, "0") });
    setOpen(true);
  };

  const startEdit = (location: MockLocation) => {
    setEditing(location);
    setDraft({ name: location.name, code: location.code });
    setOpen(true);
  };

  const save = () => {
    if (!draft.name.trim() || !draft.code.trim()) return;
    if (editing) updateMockLocation(editing.id, { name: draft.name.trim(), code: draft.code.trim() });
    else addMockLocation({ name: draft.name.trim(), code: draft.code.trim() });
    setOpen(false);
    toast.success("Demo aggiornata: nessun dato reale modificato");
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold">Zone di magazzino</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configurale una sola volta. La zona predefinita sarà proposta automaticamente nei conteggi.
          </p>
        </div>
        <Button size="sm" onClick={startCreate}>
          <Plus aria-hidden="true" />
          Aggiungi zona
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-2.5 font-medium">Nome</th>
              <th className="px-3 py-2.5 font-medium">Codice</th>
              <th className="px-3 py-2.5 font-medium">Predefinita</th>
              <th className="px-3 py-2.5 font-medium">Stato</th>
              <th className="px-5 py-2.5 text-right font-medium">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {locations.map((location) => (
              <tr key={location.id} className={location.active ? undefined : "opacity-55"}>
                <td className="px-5 py-3 font-medium">{location.name}</td>
                <td className="px-3 py-3 font-mono text-muted-foreground">{location.code}</td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    aria-label={`Rendi ${location.name} predefinita`}
                    disabled={!location.active}
                    onClick={() => {
                      setDefaultMockLocation(location.id);
                      toast.success("Zona predefinita aggiornata nella demo");
                    }}
                    className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:cursor-not-allowed"
                  >
                    {location.isDefault ? <CheckCircle2 className="size-5 text-primary" /> : <span className="size-4 rounded-full border-2 border-input" />}
                  </button>
                </td>
                <td className="px-3 py-3">{location.active ? "Attiva" : "Disattivata"}</td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(location)} aria-label={`Modifica ${location.name}`}>
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={location.isDefault}
                      onClick={() => {
                        toggleMockLocation(location.id);
                        toast.success(location.active ? "Zona disattivata nella demo" : "Zona riattivata nella demo");
                      }}
                      aria-label={location.active ? `Disattiva ${location.name}` : `Riattiva ${location.name}`}
                    >
                      <Power aria-hidden="true" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica zona" : "Aggiungi zona"}</DialogTitle>
            <DialogDescription>Questa finestra modifica soltanto i dati temporanei del prototipo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block text-sm font-medium">Nome<Input className="mt-1.5" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Magazzino Mandrione" /></label>
            <label className="block text-sm font-medium">Codice<Input className="mt-1.5" value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))} placeholder="001" /></label>
          </div>
          <DialogFooter>
            {editing && !editing.isDefault ? (
              <Button type="button" variant="outline" onClick={() => { toggleMockLocation(editing.id); setOpen(false); toast.success(editing.active ? "Zona disattivata nella demo" : "Zona riattivata nella demo"); }}>
                {editing.active ? "Disattiva" : "Riattiva"}
              </Button>
            ) : null}
            <Button type="button" disabled={!draft.name.trim() || !draft.code.trim()} onClick={save}>Salva nella demo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}