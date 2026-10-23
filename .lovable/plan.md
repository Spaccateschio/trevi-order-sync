# Stelle su più destinazioni (fornitori + acquisto diretto) — analisi e piano

Solo analisi: nessuna modifica a codice, database, dati reali, pubblicazione o roadmap.md.

## 1. Dove sta oggi la stella (sola lettura)

- Campo: `product_supplier_links.is_preferred` (boolean), con `preferred_set_at` / `preferred_set_by` (stella manuale vs automatica).
- **Nessun vincolo né indice** limita a una stella per prodotto. L'unicità la impone solo la funzione `set_preferred_product_supplier(_company_id, _product_id, _supplier_record_id)`: prima toglie la stella a tutti gli altri collegamenti del prodotto, poi la mette su quello scelto, segna `preferred_set_by` su tutti e scrive `audit_events`.
- Stella automatica: trigger `product_supplier_links_sole_preferred` (AFTER INSERT/UPDATE di is_active, supplier_record_id, b2b_item_id, product_id) → `_ensure_sole_supplier_preferred`: mette la stella da sola solo se il prodotto ha un unico fornitore attivo e nessuno l'ha mai scelta a mano.
- `unlink_product_supplier` / `unlink_b2b_catalog_item` tolgono la stella quando si scollega.
- Controllo sui dati attuali: 0 prodotti con più di una stella attiva.
- Dove si mette oggi: solo nella card della Lista (`card-suppliers.tsx`, icona stella e voce del menu ⋮). Nella scheda Prodotto → Acquisto la stellina visibile è la **Priorità** (`sourcing_priority`), non la stella preferito.

## 2. Stella sull'acquisto diretto

Oggi non esiste nessun dato salvato (la voce nella tab è solo visiva). Proposta: nuova tabella
`product_direct_purchase_preferences` (company_id, product_id unico per azienda, is_preferred, preferred_set_at, preferred_set_by, created_at). RLS con `company_id = get_user_company_id()` in sola lettura; scrittura solo tramite funzione.
Non la metterei su `products` (tabella aggiornata da Danea) per non mescolare dati del gestionale con preferenze d'acquisto.

## 3. Dove il codice usa la stella e cosa cambia

- `supplier-selection.ts` `autoPickSupplier` (righe 64–75): una stella → propone quel fornitore; più stelle → `da_scegliere «Più fornitori preferiti»`. **Già oggi con più stelle non assegna nulla**: il comportamento richiesto esiste, cambia solo il motivo/avviso.
- `supplier-selection.ts` `visualPick` (righe 309–319): più stelle → nessuna spunta. Da cambiare: con più stelle spunta (solo visivamente) tutte le destinazioni con stella, compreso l'acquisto diretto.
- `supplier-memory.ts` `chooseListDestinations` (righe 26–47): la memoria dell'ultima Lista vale se la stella non è cambiata dopo. Con più stelle: se la memoria vale, resta prioritaria come oggi (decisione da confermare, vedi Domande); altrimenti restituisce tutte le destinazioni con stella con motivo `"piu_stelle"` e **nessuna scrittura**.
- `shopping-auto-assign.ts` (righe 248–307): con più stelle non deve scrivere quote; resta `da_scegliere` con avviso «Da ripartire». Filtro giorni di consegna invariato: un fornitore stellato non in tempo resta proposto con avviso rosso (già presente via `lateWarning`), non viene tolto in silenzio. Nota: oggi il filtro giorni toglie i fornitori in ritardo prima della scelta; con più stelle va applicato solo come avviso.
- Una sola stella e nessuna stella: nessun cambiamento.

## 4. File dell'interfaccia

- `src/components/products/product-suppliers-manager.tsx`: stella preferito su ogni fornitore e sulla voce «Acquisto diretto — compro io» (oggi solo visiva: diventa salvata).
- `src/components/shopping/card-suppliers.tsx`: la stella non toglie più quella degli altri (toggle), riga «Acquisto diretto» con stella, avviso «Da ripartire» con più stelle.
- `src/components/shopping/supplier-split-dialog.tsx` («Fornitori e ripartizione»): destinazioni con stella già proposte in cima, acquisto diretto compreso; quantità a mano.
- `src/lib/supplier-selection.ts`, `src/lib/supplier-memory.ts`, `src/lib/shopping-auto-assign.ts`, `src/lib/shopping-card-reads.ts` (lettura stella acquisto diretto) + test in `list-preselection.test.ts` e `supplier-selection.test.ts`.

## 5. Migrazioni e app pubblicata

Servono (non applicate):
1. Nuova tabella `product_direct_purchase_preferences` + GRANT + RLS — additiva, innocua per l'app pubblicata.
2. Nuova funzione `toggle_product_destination_star(_company_id, _product_id, _supplier_record_id, _direct boolean, _on boolean)` (SECURITY DEFINER, search_path=public, controllo `is_company_admin`, audit) che aggiunge/toglie **senza** togliere le altre — additiva.
3. **Da rinviare**: cambiare `set_preferred_product_supplier` o il trigger. Non serve toccarli: restano per l'app pubblicata. Rischio: dal momento in cui un prodotto ha due stelle, l'app **pubblicata** (database condiviso) mostrerà «Più fornitori preferiti» e non assegnerà più in automatico; se lì si preme la stella, toglierà le altre. Quindi la funzione nuova va usata solo in anteprima finché non si pubblica, e il collaudo solo su 3 EMME.

```sql
CREATE TABLE public.product_direct_purchase_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  is_preferred boolean NOT NULL DEFAULT false,
  preferred_set_at timestamptz, preferred_set_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, product_id)
);
GRANT SELECT ON public.product_direct_purchase_preferences TO authenticated;
GRANT ALL ON public.product_direct_purchase_preferences TO service_role;
ALTER TABLE public.product_direct_purchase_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lettura azienda" ON public.product_direct_purchase_preferences
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
-- + funzione toggle_product_destination_star (SECURITY DEFINER, is_company_admin, audit_events,
--   nessun RETURN dopo la prima scrittura, solo RAISE EXCEPTION)
```

## 6. Prove previste su 3 EMME (solo anteprima, nessun invio)

1. Una stella: come oggi, tutta la quantità al fornitore con stella.
2. Due stelle: entrambi spuntati, nessuna quota, avviso «Da ripartire»; ripartizione a mano funziona.
3. Stella + acquisto diretto: fornitore e «compro io» proposti, nessuna quota, avviso.
4. Nessuna stella: come oggi.
5. Stella su un fornitore che non consegna entro «Per quando serve»: resta proposto con avviso rosso e prima consegna possibile.

## Domande prima di implementare

- Con più stelle, la memoria dell'ultima Lista (stesse destinazioni e proporzioni) deve ancora riproporre le quantità in automatico, o con più stelle si ripartisce sempre a mano?
- La stella va messa solo dagli amministratori, come oggi?
