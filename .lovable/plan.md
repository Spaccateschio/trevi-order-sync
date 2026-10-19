# Fase 1 — Sicurezza della lettura di giacenza

## Perimetro e arresto obbligatorio
Solo analisi e proposta. Nessuna correzione applicata, migrazione, assegnazione proprietà, modifica di dati, roadmap.md o pubblicazione. A/B/C/D restano sospese. Architettura 2A e requisiti futuri dei tre ruoli approvati, non implementazione. Piano esecutivo 2A soltanto dopo conclusione Fase 1.

## Riscontri effettivi in sola lettura
`public.inventory_location_stock(_product_id uuid, _location_id uuid)` restituisce `has_count boolean, quantity numeric, counted_at timestamptz, counted_by uuid`.
- Una sola firma live: LANGUAGE sql, STABLE, SECURITY DEFINER, search_path=public, proprietario SQL postgres.
- EXECUTE: authenticated e service_role sì; anon no; nessuna concessione PUBLIC nell'ACL osservata.
- Corpo attuale senza controllo auth.uid/appartenenza/azienda. Il proprietario SQL supera la RLS ordinaria: conoscere prodotto e ubicazione permette a un utente authenticated estraneo di richiedere giacenza e autore del conteggio. È un difetto dimostrato dalla definizione e dai privilegi, non un abuso riprodotto con sessione reale.
- Calcolo attuale: somma card valide della sessione di riferimento + rettifiche + movimenti successivi; NULL senza conteggio valido. Nessun calcolo verrà cambiato.
- `is_company_member` legge auth.uid e membership attiva. Non verifica stato globale profilo/azienda: preservare questo significato, nessuna modifica al helper.

### Dipendenze live e applicazione
Quattro chiamanti SQL correnti, tutti con propri controlli aziendali:
1. inventory_location_stock_list(uuid,uuid,uuid): membership e ubicazione dell'azienda.
2. inventory_requirements(uuid,uuid,jsonb): membership e prodotti/ubicazioni dell'azienda; LEFT JOIN può passare ubicazione NULL quando non esistono ubicazioni attive.
3. product_stock_overview(uuid): membership del proprietario prodotto; ubicazioni della stessa azienda.
4. product_lot_reconciliation(uuid,uuid): membership e ubicazioni dell'azienda prodotto.

Nessuna chiamata diretta nel frontend alla funzione vulnerabile. Punti correnti:
- src/components/inventory/inventory-session-counter.tsx:69
- src/components/inventory/inventory-count-panel.tsx:646
- src/components/shopping/inventory-to-evaluate.tsx:95
- src/components/shopping/shopping-list-panel.tsx:588
- src/components/inventory/inventory-requirements-panel.tsx:113
- src/components/products/product-stock-panel.tsx:61
- src/components/products/product-provenance-panel.tsx:57
- src/lib/purchase.functions.ts:390 chiama open_lot_reconciliation, che usa product_lot_reconciliation indirettamente. Non eseguire: scrive dati.

Le vecchie definizioni nelle migrazioni chiamavano questa funzione anche per conteggi/sessioni/proposte. Queste chiamate non compaiono nelle rispettive definizioni live attuali: non confondere storia con dipendenze correnti. Il catalogo pg_depend registra solo la dipendenza schema per questo corpo SQL testuale: non è un inventario completo dei chiamanti. La ricerca del testo delle funzioni live individua i quattro sopra.

## Correzione proposta
Mantenere firma, linguaggio, stabilità, SECURITY DEFINER, search_path e privilegi attuali; aggiungere solo un controllo di lettura:
- Proprietario del prodotto derivato dal DB, non da parametro aziendale browser.
- Membership attiva dell'utente autenticato richiesta.
- Ubicazione, quando presente, appartenente alla stessa azienda del prodotto.
- Non autorizzato: **zero righe**, non una giacenza zero né una falsa indicazione «mai contato».
- Ubicazione NULL: consentita al membro autorizzato per preservare il LEFT JOIN del Fabbisogno; risultato invariato senza conteggio.

### SQL esatto proposto — NON APPLICATO
```sql
CREATE OR REPLACE FUNCTION public.inventory_location_stock(_product_id uuid, _location_id uuid)
 RETURNS TABLE(has_count boolean, quantity numeric, counted_at timestamp with time zone, counted_by uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH authorized AS (
    SELECT p.company_id
    FROM public.products p
    WHERE p.id = _product_id
      AND public.is_company_member(p.company_id)
      AND (
        _location_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.inventory_locations l
          WHERE l.id = _location_id
            AND l.company_id = p.company_id
        )
      )
  ), valid AS (
    SELECT c.id, c.session_id, c.counted_quantity, c.counted_at, c.counted_by
    FROM public.inventory_counts c
    JOIN public.inventory_sessions s ON s.id = c.session_id
    JOIN public.products p ON p.id = c.product_id
    LEFT JOIN public.units_of_measure su ON su.id = p.stock_unit_id
    WHERE c.product_id = _product_id
      AND c.location_id = _location_id
      AND EXISTS (SELECT 1 FROM authorized)
      AND s.status = 'completata'
      AND p.stock_unit_id IS NOT NULL
      AND su.code IS NOT NULL
      AND NULLIF(btrim(COALESCE(c.unit_code, '')), '') IS NOT NULL
      AND lower(btrim(c.unit_code)) = lower(btrim(su.code))
      AND (p.stock_base_at IS NULL OR c.counted_at >= p.stock_base_at)
  ), last_count AS (
    SELECT v.session_id, v.counted_quantity, v.counted_at, v.counted_by
    FROM valid v ORDER BY v.counted_at DESC, v.id DESC LIMIT 1
  )
  SELECT
    EXISTS (SELECT 1 FROM last_count),
    CASE WHEN EXISTS (SELECT 1 FROM last_count)
      THEN (SELECT sum(v.counted_quantity) FROM valid v WHERE v.session_id = (SELECT session_id FROM last_count))
           + COALESCE((
               SELECT sum(a.quantity) FROM public.inventory_adjustments a
               WHERE a.product_id = _product_id AND a.location_id = _location_id
                 AND a.created_at >= (SELECT counted_at FROM last_count)
             ), 0)
           + COALESCE((
               SELECT sum(m.quantity) FROM public.inventory_movements m
               WHERE m.product_id = _product_id AND m.location_id = _location_id
                 AND m.created_at >= (SELECT counted_at FROM last_count)
             ), 0)
      ELSE NULL
    END,
    (SELECT counted_at FROM last_count),
    (SELECT counted_by FROM last_count)
  WHERE EXISTS (SELECT 1 FROM authorized);
$function$;
```

CREATE OR REPLACE mantiene ACL/proprietario della funzione esistente. Nessun GRANT nuovo, nessuna tabella, nessuna modifica alle altre RPC. Applicazione futura solo via strumento migration, con questo testo identico approvato.

## Rischi di regressione da verificare
- Nessun filtro status aggiunto a prodotti/ubicazioni: preservati dati archiviati e zone storiche autorizzate.
- Nessuna conversione, arrotondamento, somma o data ricalcolata.
- Nessun conteggio: membro autorizzato continua a ricevere has_count=false e quantity/count timestamps/author NULL.
- Ubicazione NULL autorizzata preserva il caso Fabbisogno senza zone; test essenziale per counted_locations/total_locations.
- Ubicazione di azienda diversa/non esistente: zero righe. Il vecchio risultato per input non valido cambia intenzionalmente; nessun chiamante lecito individuato lo richiede.
- Chiamata service_role priva di utente autenticato: zero righe, perché il controllo resta auth.uid. I quattro chiamanti live ricevono l'identità originale anche se SECURITY DEFINER. Non aggiungere bypass per current_user, che sarebbe postgres anche nelle chiamate utente.
- Eventuali integrazioni esterne non presenti nel repository non sono dimostrate assenti. Nessuna prova service-role deve essere considerata collaudo utente.
- Costi aggiuntivi: ricerca prodotto/ubicazione/membership; misurare letture aggregate autorizzate dopo applicazione.

## Prove previste, non eseguite
Dopo conferma della correzione, controlli in sola lettura tramite RPC/Data API con sessioni vere authenticated, mai identità artificiale o service_role per certificarli.

| Caso | Risultato atteso |
|---|---|
| Membro attivo proprietario | Stessi quattro valori prima/dopo, inclusi autore/data; nessuna differenza numerica. |
| Utente senza membership proprietaria, anche se membro altrove | Zero righe chiamando direttamente la funzione con prodotto/ubicazione di 3 EMME. Nessuna prova sui dati Trevi. |
| Membro disattivato | Zero righe anche con access token ancora valido. |
| Prodotto e ubicazione di aziende differenti | Zero righe. |
| Prodotto inesistente/NULL | Zero righe. |
| Nessun conteggio valido | Una riga per autorizzato: false/NULL/NULL/NULL. |
| Ubicazione NULL di membro autorizzato | Stesso risultato precedente; Fabbisogno senza zone invariato. |
| Più card e movimenti/rettifiche | Stesso totale, date e autore; nessuna scrittura per costruire dati operativi. |
| Quattro wrapper live | Uguaglianza risultato completo prima/dopo sulle risorse autorizzate, conservando dinieghi e risultati neutri precedenti. |

Conteggi/sessioni/proposte leggono ora le funzioni card: verificare definizioni e test locali pertinenti, senza eseguire scritture operative. open_lot_reconciliation: nessun test di scrittura reale; copertura isolata o rinvio esplicito.

Non esistono attualmente fixture/utenti dedicati per tutti i casi: la futura creazione utenti/dati in 3 EMME richiede autorizzazione distinta, oggi negata per il collaudo. Senza sessione disattivata/estranea e casi dati appropriati, riportare **non verificato**, non «superato». Non disattivare Andrea per creare il caso di prova.

### File futuri, esclusivamente dopo conferma
- Una migrazione generata dallo strumento per la sola funzione, nome logico `inventory_location_stock_access_guard`.
- `src/lib/inventory-location-stock.security.test.ts`: controlli RPC di sola lettura parametrizzati con sessioni/dati di prova autorizzati; un test per regola. Nessuna creazione utenti o scrittura nei test. Escludere token da output.
- Test esistenti di inventario/U.M./card pertinenti da eseguire, senza modificarli incidentalmente.
- Nessun file pagina, ordine, Preparazione, Lista, Danea, roadmap o funzione comune modificato.

## Account Trevi — guida
Nell'anteprima usare **Esci** nella barra laterale (o icona nell'intestazione), poi **Accedi** con l'account Trevi abituale. Non usare Registrati; non inviare password, token o screenshot sensibili in chat. Account mostra l'email per orientarsi, non certifica da solo auth.users.id. Scrivere «Accesso Trevi effettuato»: al messaggio successivo verificare la sessione tramite servizio auth e le appartenenze attive in sola lettura, senza attribuire proprietà.

Account Trevi candidato nel database: `0f00ea59-a549-4bcd-8dde-9bfc1a9a2781`; occorre riscontrarlo nella sua sessione. 3 EMME previsto `b9db9303-4b9d-4135-a8d5-94bfb6fa5758`, nessuna assegnazione. 2A soltanto dopo Fase 1.

**Arresto:** approvare esclusivamente il SQL e perimetro della correzione Fase 1; nessuna autorizzazione implicita a prove con nuovi utenti, 2A/B/C/D o pubblicazione.
