# Fase 1: collegamento B2B nelle offerte e correzione di «Copia nei miei prodotti»

Questo è solo il piano: la migrazione non è stata applicata. I nomi e i tipi delle colonne sono stati verificati nel database (tutti gli identificativi sono `uuid`).

## Esito dei 9 controlli

| # | Controllo | Esito | Soluzione |
|---|---|---|---|
| 1 | Una sola riga per lista e prodotto | **Esiste già**: l'indice `shopping_list_items_unique (list_id, product_id)` | Nessun vincolo nuovo. L'unica funzione che inserisce righe nella Lista è `add_shopping_list_items`, anche quando la chiama `confirm_shopping_list_product`. Prima di inserire controlla se il prodotto è già presente, e in quel caso aggiorna o salta la riga: nessuna procedura si interrompe |
| 2 | Un articolo B2B deve appartenere al fornitore del collegamento | Oggi 0 casi errati | Un **controllo automatico nel database** (punto 8) che vale per ogni inserimento e modifica, da qualunque funzione |
| 3 | Collegamenti disattivati | 3 collegamenti disattivati | Il vincolo vale solo per i collegamenti attivi. `add_catalog_product_to_own_products` oggi trova il collegamento disattivato ma **non lo riattiva**: lo correggo perché lo riattivi. Il «Togli fornitore» resta com'è |
| 4 | Prodotto e collegamento insieme | — | Una sola funzione nuova, in una sola transazione (punto 9) |
| 5 | «Crea comunque una nuova copia» | — | Il prodotto ha l'origine compilata, ma è **senza collegamento B2B** se l'articolo è già collegato altrove, con il messaggio richiesto |
| 6 | Nuova spunta sulle quote fornitore (`is_selected`) | 1 quota nelle Liste aperte | Valore iniziale «no», poi compilato a «sì» **solo nelle Liste aperte**, solo sulle quote che hanno una quantità. Il campo non è letto da nessuna funzione fino alla fase 5. Le Liste chiuse non vengono toccate e lì il campo non va mai letto |
| 7 | Nomi e tipi delle colonne | Verificati | Uso i campi esistenti `product_supplier_links`, `products.created_from_product_id` e `created_from_company_id`, `supplier_customer_relations.supplier_record_id` |

**Dati trovati che riguardano la compilazione dei campi nuovi**
- Il prodotto 00-001 PATATE NOVELLE ha due collegamenti attivi: Trevi (codice 1043) e Breda Caffè, che è un fornitore esterno.
- Solo il collegamento di Trevi riceve l'articolo B2B. Breda resta esterno.
- Nessun vincolo viene violato.

## Modifiche al database (da approvare)

```sql
-- A. Collegamento: azienda fornitrice e articolo B2B (aggiunte, nessuna colonna tolta)
ALTER TABLE public.product_supplier_links
  ADD COLUMN IF NOT EXISTS supplier_company_id uuid REFERENCES public.companies(id),
  ADD COLUMN IF NOT EXISTS b2b_item_id uuid REFERENCES public.products(id);

-- Compilazione dai dati attuali: azienda dal rapporto B2B del fornitore;
-- articolo solo se la copia nasce proprio da quel venditore (Breda resta esterno)
UPDATE public.product_supplier_links k
SET supplier_company_id = r.seller_company_id,
    b2b_item_id = CASE WHEN p.created_from_company_id = r.seller_company_id
                       THEN p.created_from_product_id END
FROM public.supplier_customer_relations r, public.products p
WHERE r.supplier_record_id = k.supplier_record_id
  AND r.buyer_company_id = k.company_id
  AND p.id = k.product_id;

-- B. Controllo automatico: vale per ogni funzione, presente e futura
CREATE OR REPLACE FUNCTION public.guard_supplier_link_b2b_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.b2b_item_id IS NOT NULL OR NEW.supplier_company_id IS NOT NULL THEN
    IF NEW.supplier_company_id IS NULL THEN
      RAISE EXCEPTION 'Collegamento B2B senza azienda fornitrice';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.supplier_customer_relations r
                   WHERE r.supplier_record_id = NEW.supplier_record_id
                     AND r.buyer_company_id = NEW.company_id
                     AND r.seller_company_id = NEW.supplier_company_id) THEN
      RAISE EXCEPTION 'La scheda fornitore non corrisponde all''azienda fornitrice B2B';
    END IF;
    IF NEW.b2b_item_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.products s
         WHERE s.id = NEW.b2b_item_id AND s.company_id = NEW.supplier_company_id) THEN
      RAISE EXCEPTION 'L''articolo B2B non appartiene a questo fornitore';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_supplier_links_b2b_guard
  BEFORE INSERT OR UPDATE OF b2b_item_id, supplier_company_id, supplier_record_id, company_id
  ON public.product_supplier_links
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_link_b2b_item();

-- C. Un articolo B2B collegato a un solo nostro prodotto attivo
CREATE UNIQUE INDEX IF NOT EXISTS product_supplier_links_one_active_b2b_item
  ON public.product_supplier_links (company_id, b2b_item_id)
  WHERE b2b_item_id IS NOT NULL AND is_active;

-- D. Spunta sulle quote fornitore: valore iniziale «no», «sì» solo nelle Liste aperte con quantità
ALTER TABLE public.shopping_list_item_suppliers
  ADD COLUMN IF NOT EXISTS is_selected boolean NOT NULL DEFAULT false;
UPDATE public.shopping_list_item_suppliers s SET is_selected = true
FROM public.shopping_list_items i JOIN public.shopping_lists l ON l.id = i.list_id
WHERE i.id = s.item_id AND l.status IN ('aperta','confermata')
  AND (COALESCE(s.purchase_quantity,0) > 0 OR COALESCE(s.assigned_quantity,0) > 0);
COMMENT ON COLUMN public.shopping_list_item_suppliers.is_selected IS
  'Spunta «compro da qui»: letta solo nelle Liste aperte (fase 5); non significativa nelle Liste chiuse';
```

**E. Nuova funzione `copy_b2b_item_to_own_product`**, in una sola transazione:
- **Controlli:**
  - solo amministratori (`is_company_admin`);
  - rapporto operativo con il venditore (`relation_is_operational`);
  - l'articolo deve appartenere al venditore.
- **Creazione del prodotto:** stesse regole di `manage_internal_product` (codice proposto o scritto, codice doppio rifiutato, descrizione obbligatoria, U.M. solo della nostra azienda). In più compila `created_from_product_id` e `created_from_company_id`.
- **Se l'articolo non è collegato a un altro prodotto attivo:** crea nella stessa transazione il collegamento B2B (scheda fornitore presa dal rapporto, `supplier_company_id`, `b2b_item_id`, codice articolo del fornitore). Senza U.M. d'acquisto e senza prezzo.
- **Se l'articolo è già collegato altrove:** crea solo il prodotto e restituisce codice e descrizione del prodotto già collegato.
- Se un passaggio fallisce, non viene salvato niente.
- Ogni creazione viene registrata nello storico delle operazioni.
- Eseguibile solo dagli utenti autenticati (`authenticated`).

**F. `add_catalog_product_to_own_products`:**
- riattiva il collegamento trovato quando è disattivato;
- compila `supplier_company_id` e `b2b_item_id`;
- se l'articolo è già collegato a un altro prodotto, dà un messaggio chiaro invece di un errore tecnico.

## Modifiche all'app

- `src/lib/shopping-list.functions.ts` oppure un nuovo file `src/lib/b2b-copy.functions.ts`: la funzione del server che chiama la nuova funzione con l'utente collegato.
- `src/components/shopping/copy-to-own-products.tsx`:
  - usa la nuova funzione invece della finestra generica;
  - le note non riportano più l'origine;
  - dopo il salvataggio mostra «Copia creata e collegata a [fornitore]» oppure «Copia creata senza collegamento al fornitore: l'articolo è già collegato a [codice · descrizione]».
- `src/components/products/internal-product-dialog.tsx`: un aggancio facoltativo per salvare con un'altra funzione. La creazione normale non cambia.
- `src/components/shopping/AGENTS.md`: una regola sull'articolo B2B nel collegamento.

## Cosa non viene toccato

Liste chiuse, ordini, carichi merce, acquisti diretti, quantità, prezzi, stati, Inventario, Fabbisogno, semaforo, Danea. La quantità delle quote resta obbligatoria: si potrà lasciare vuota solo nella fase 5.

## Prove dopo l'approvazione

1. Copia di un articolo libero: prodotto e collegamento creati insieme.
2. Copia di un articolo già collegato: avviso, poi «Crea comunque»: prodotto senza collegamento e messaggio.
3. Collegamento con un articolo di un'altra azienda: rifiutato dal controllo automatico.
4. Collegamento disattivato: viene riattivato e non duplicato.
5. Utente non amministratore: operazione rifiutata.
6. Quota della Lista aperta con spunta a «sì», Liste chiuse invariate.
7. Le patate 00-001: Trevi diventa B2B, Breda resta esterno.

## Fasi successive (ordine da te indicato)

2. Collegamento B2B ai nostri prodotti.
3. Fornitori esterni.
4. U.M. e conversioni.
5. Nuova gestione della Lista.
