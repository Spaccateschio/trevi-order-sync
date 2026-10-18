import { useMemo, useState } from "react";
import { Plus, Settings2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ACTIONS,
  AREAS,
  DEMO_COLLABORATORS,
  DEMO_DEPARTMENTS,
  DEMO_LIST_ROWS,
  DEMO_SUPPLIERS,
  PRESETS,
  combinePresets,
  type ActionId,
  type AreaId,
  type Collaborator,
  type Department,
  type PresetId,
  type SupplierRule,
} from "./team-demo-data";

const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
const RULE_LABEL: Record<SupplierRule["mode"], string> = {
  consentito: "Può ordinare",
  solo_vedere: "Solo vedere",
  escluso: "Escluso",
};

/** Mockup: solo stato React, nessun salvataggio. */
export function TeamMockup() {
  const [people, setPeople] = useState<Collaborator[]>(DEMO_COLLABORATORS);
  const [departments, setDepartments] = useState<Department[]>(DEMO_DEPARTMENTS);
  const [editing, setEditing] = useState<Collaborator | null>(null);
  const [inviting, setInviting] = useState(false);

  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? id;

  function save(c: Collaborator) {
    setPeople((list) => (list.some((p) => p.id === c.id) ? list.map((p) => (p.id === c.id ? c : p)) : [...list, c]));
    setEditing(null);
    toast.success("Salvato solo in questa anteprima");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-accent bg-accent/20 p-3 text-sm">
        <strong>Anteprima dimostrativa.</strong> Persone, reparti e liste sono inventati: nulla viene salvato e nessuna email viene inviata.
      </div>
      <Tabs defaultValue="collaboratori">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="collaboratori">Collaboratori</TabsTrigger>
          <TabsTrigger value="reparti">Reparti</TabsTrigger>
          <TabsTrigger value="liste">Liste per reparto</TabsTrigger>
        </TabsList>

        <TabsContent value="collaboratori" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setInviting(true)}>
              <UserPlus className="mr-1 h-4 w-4" /> Invita collaboratore
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {people.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                  </div>
                  <Badge variant={p.status === "attivo" ? "default" : "secondary"}>{p.status}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.presets.map((id) => (
                    <Badge key={id} variant="outline">{PRESETS[id].label}</Badge>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Reparti: {p.departments.length ? p.departments.map(deptName).join(", ") : "nessuno"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={p.presets.includes("super")}
                  onClick={() => setEditing(p)}
                >
                  <Settings2 className="mr-1 h-4 w-4" />
                  {p.presets.includes("super") ? "Titolare: non modificabile" : "Permessi"}
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="reparti">
          <DepartmentsManager departments={departments} onChange={setDepartments} />
        </TabsContent>

        <TabsContent value="liste">
          <DepartmentLists departments={departments} people={people} />
        </TabsContent>
      </Tabs>

      {inviting ? (
        <InviteDialog
          departments={departments}
          onClose={() => setInviting(false)}
          onInvite={(c) => {
            setInviting(false);
            setEditing(c);
          }}
        />
      ) : null}
      {editing ? (
        <PermissionsDialog
          person={editing}
          departments={departments}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </div>
  );
}

function InviteDialog({ departments, onClose, onInvite }: { departments: Department[]; onClose: () => void; onInvite: (c: Collaborator) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [presets, setPresets] = useState<PresetId[]>(["compratore"]);
  const togglePreset = (id: PresetId) =>
    setPresets((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] overflow-y-auto">
        <DialogHeader><DialogTitle>Invita collaboratore</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="invite-name">Nome</Label><Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label htmlFor="invite-email">Email</Label><Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div>
            <Label>Profili di partenza (combinabili)</Label>
            <div className="mt-2 space-y-2">
              {PRESET_IDS.filter((id) => id !== "super").map((id) => (
                <label key={id} className="flex items-start gap-2 text-sm">
                  <Checkbox checked={presets.includes(id)} onCheckedChange={() => togglePreset(id)} />
                  <span><strong>{PRESETS[id].label}</strong> — <span className="text-muted-foreground">{PRESETS[id].description}</span></span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            disabled={!name.trim() || !email.includes("@") || presets.length === 0}
            onClick={() =>
              onInvite({
                id: `n${Date.now()}`,
                name: name.trim(),
                email: email.trim(),
                status: "invitato",
                presets,
                departments: departments.filter((d) => d.active).slice(0, 1).map((d) => d.id),
                supplierRules: [],
                ...combinePresets(presets),
              })
            }
          >
            Continua ai permessi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsDialog({ person, departments, onClose, onSave }: { person: Collaborator; departments: Department[]; onClose: () => void; onSave: (c: Collaborator) => void }) {
  const [draft, setDraft] = useState<Collaborator>(person);
  const [newSupplier, setNewSupplier] = useState<string>("");

  function toggle(area: AreaId, action: ActionId) {
    setDraft((d) => {
      const cur = d.permissions[area];
      let next = cur.includes(action) ? cur.filter((a) => a !== action) : [...cur, action];
      // Ogni azione richiede di poter vedere; togliere «Visualizzare» toglie tutto.
      if (action === "vedere" && cur.includes("vedere")) next = [];
      else if (action !== "vedere" && !next.includes("vedere") && next.length) next = ["vedere", ...next];
      return { ...d, permissions: { ...d.permissions, [area]: next } };
    });
  }
  const toggleDept = (id: string) =>
    setDraft((d) => ({ ...d, departments: d.departments.includes(id) ? d.departments.filter((x) => x !== id) : [...d.departments, id] }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-3xl overflow-y-auto overflow-x-hidden">
        <DialogHeader><DialogTitle>Permessi di {draft.name}</DialogTitle></DialogHeader>

        <section>
          <h3 className="text-sm font-semibold">Reparti autorizzati</h3>
          <div className="mt-2 flex flex-wrap gap-3">
            {departments.filter((d) => d.active).map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={draft.departments.includes(d.id)} onCheckedChange={() => toggleDept(d.id)} />
                {d.name}
              </label>
            ))}
          </div>
        </section>

        <section className="min-w-0">
          <h3 className="text-sm font-semibold">Pagine e azioni</h3>
          <div className="mt-2 max-w-full overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">Pagina</th>
                  {ACTIONS.map((a) => <th key={a.id} className="p-2">{a.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {AREAS.map((area) => (
                  <tr key={area.id} className="border-t border-border">
                    <td className="p-2 font-medium">{area.label}</td>
                    {ACTIONS.map((a) => (
                      <td key={a.id} className="p-2 text-center">
                        <Checkbox
                          aria-label={`${area.label}: ${a.label}`}
                          checked={draft.permissions[area.id].includes(a.id)}
                          onCheckedChange={() => toggle(area.id, a.id)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
            Vede prezzi e costi
            <Switch checked={draft.extras.prezzi} onCheckedChange={(v) => setDraft((d) => ({ ...d, extras: { ...d.extras, prezzi: v } }))} />
          </label>
          <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
            Gestisce fornitori
            <Switch checked={draft.extras.gestioneFornitori} onCheckedChange={(v) => setDraft((d) => ({ ...d, extras: { ...d.extras, gestioneFornitori: v } }))} />
          </label>
        </section>

        <section>
          <h3 className="text-sm font-semibold">Eccezioni per fornitore</h3>
          <p className="text-xs text-muted-foreground">Senza eccezioni valgono i permessi sopra per tutti i fornitori dei suoi reparti.</p>
          <div className="mt-2 space-y-2">
            {draft.supplierRules.map((r) => (
              <div key={r.supplier} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{r.supplier}</span>
                <Select
                  value={r.mode}
                  onValueChange={(v) => setDraft((d) => ({ ...d, supplierRules: d.supplierRules.map((x) => (x.supplier === r.supplier ? { ...x, mode: v as SupplierRule["mode"] } : x)) }))}
                >
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(RULE_LABEL) as SupplierRule["mode"][]).map((m) => <SelectItem key={m} value={m}>{RULE_LABEL[m]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => setDraft((d) => ({ ...d, supplierRules: d.supplierRules.filter((x) => x.supplier !== r.supplier) }))}>Togli</Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Select value={newSupplier} onValueChange={setNewSupplier}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Scegli fornitore" /></SelectTrigger>
                <SelectContent>
                  {DEMO_SUPPLIERS.filter((s) => !draft.supplierRules.some((r) => r.supplier === s)).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={!newSupplier}
                onClick={() => { setDraft((d) => ({ ...d, supplierRules: [...d.supplierRules, { supplier: newSupplier, mode: "solo_vedere" }] })); setNewSupplier(""); }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDraft((d) => ({ ...d, ...combinePresets(d.presets) }))}>Ripristina profilo</Button>
          {draft.status !== "disattivato" ? (
            <Button variant="outline" onClick={() => onSave({ ...draft, status: "disattivato" })}>Disattiva</Button>
          ) : (
            <Button variant="outline" onClick={() => onSave({ ...draft, status: "attivo" })}>Riattiva</Button>
          )}
          <Button onClick={() => onSave(draft)}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DepartmentsManager({ departments, onChange }: { departments: Department[]; onChange: (d: Department[]) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="Nuovo reparto" value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={!name.trim()} onClick={() => { onChange([...departments, { id: `d${Date.now()}`, name: name.trim(), active: true }]); setName(""); }}>Aggiungi</Button>
      </div>
      {departments.map((d) => (
        <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
          <Input
            value={d.name}
            onChange={(e) => onChange(departments.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)))}
            className="flex-1"
            aria-label="Nome reparto"
          />
          <Badge variant={d.active ? "default" : "secondary"}>{d.active ? "attivo" : "disattivato"}</Badge>
          <Button variant="outline" size="sm" onClick={() => onChange(departments.map((x) => (x.id === d.id ? { ...x, active: !x.active } : x)))}>
            {d.active ? "Disattiva" : "Riattiva"}
          </Button>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">I reparti non si cancellano: si disattivano. La giacenza resta unica per prodotto e ubicazione.</p>
    </div>
  );
}

function DepartmentLists({ departments, people }: { departments: Department[]; people: Collaborator[] }) {
  const [viewer, setViewer] = useState<string>(people.find((p) => p.presets.includes("compratore"))?.id ?? people[0]!.id);
  const person = people.find((p) => p.id === viewer) ?? people[0]!;
  const isAdmin = person.presets.includes("super") || person.presets.includes("amministratore");
  const seesLists = isAdmin || person.permissions.lista.includes("vedere");
  const allowed = seesLists ? departments.filter((d) => d.active && (isAdmin || person.departments.includes(d.id))) : [];
  const [current, setCurrent] = useState<string>("tutti");
  const active = isAdmin && current === "tutti" ? "tutti" : allowed.some((d) => d.id === current) ? current : allowed[0]?.id;

  const rows = DEMO_LIST_ROWS.filter((r) => (active === "tutti" ? allowed.some((d) => d.id === r.department) : r.department === active));
  const bySupplier = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) m.set(r.supplier, [...(m.get(r.supplier) ?? []), r]);
    return [...m.entries()];
  }, [rows]);
  const rule = (s: string) => person.supplierRules.find((r) => r.supplier === s)?.mode ?? "consentito";
  const canSend = person.permissions.ordini.includes("inviare");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Guarda come:</span>
        <Select value={viewer} onValueChange={(v) => { setViewer(v); setCurrent("tutti"); }}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>{people.filter((p) => p.status !== "disattivato").map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">Ciclo acquisti aziendale unico: Inventario → Liste di reparto → Ordini.</p>

      {allowed.length === 0 ? (
        <p className="text-sm text-muted-foreground">{seesLists ? "Questo collaboratore non ha reparti: non vede nessuna lista." : "Questo collaboratore non ha il permesso di vedere la Lista della Spesa."}</p>
      ) : (
        <div className="flex gap-1 overflow-x-auto">
          {isAdmin ? <Button size="sm" variant={active === "tutti" ? "default" : "outline"} onClick={() => setCurrent("tutti")}>Vista generale</Button> : null}
          {allowed.map((d) => (
            <Button key={d.id} size="sm" variant={active === d.id ? "default" : "outline"} onClick={() => setCurrent(d.id)}>{d.name}</Button>
          ))}
        </div>
      )}

      {bySupplier.map(([supplier, list]) => (
        <div key={supplier} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{supplier}</p>
            <Badge variant="outline">{RULE_LABEL[rule(supplier)]}</Badge>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {list.map((r) => (
              <li key={r.product} className="flex justify-between gap-2">
                <span>{r.product} <span className="text-xs text-muted-foreground">· {departments.find((d) => d.id === r.department)?.name}</span></span>
                <span className="text-muted-foreground">{r.qty}</span>
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            className="mt-3"
            disabled={!canSend || rule(supplier) !== "consentito"}
            onClick={() => toast.info("Anteprima: un solo ordine per fornitore, ogni riga conserva il suo reparto. Nessun invio.")}
          >
            Ordine consolidato
          </Button>
        </div>
      ))}
    </div>
  );
}
