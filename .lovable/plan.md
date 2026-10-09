# Catalogo: preferiti non acquistabili (v2, NON applicato)

## 1. Risultati delle letture

### Stati dei rapporti (`supplier_customer_relations`)
| status | seller_enabled | buyer_enabled | righe |
|---|---|---|---|
| attivo | true | true | 1 |

Gli altri valori possibili (`in_attesa`, `sospeso`, `revocato`, `rifiutato`) oggi non compaiono in nessuna riga.

### Vincoli sui rapporti
- `relations_unique_pair` UNIQUE (seller_company_id, buyer_company_id), più un secondo indice unico identico.
- `relations_not_self` CHECK: venditore ≠ cliente.
- Nessun CHECK sulle combinazioni stato/abilitazioni.

**Più righe per la stessa coppia cliente-fornitore non possono esistere**: il vincolo unico lo impedisce, e oggi ci sono 0 coppie con più righe. La precedenza fra righe resta comunque scritta nella funzione (operativo > in pausa > non attivo > cessato), come difesa nel caso in cui il vincolo venisse tolto.

### Colonne già obbligatorie (NOT NULL)
- `products`: publish_status, b2b_visible, company_id, code.
- `supplier_customer_relations`: status, seller_enabled, buyer_enabled.
- `buyer_product_favorites`: buyer_company_id, seller_company_id, product_id, created_at.

I NULL possono quindi venire solo dalle LEFT JOIN (nessun rapporto). La funzione li gestisce comunque in modo esplicito con COALESCE(..., false).

### Coerenza con le regole esistenti
- `relation_is_operational` e `can_view_seller_catalogue` usano lo stesso criterio di «operativo»: `status = 'attivo'` AND seller_enabled AND buyer_enabled.
- La stessa regola vale per gli acquisti: la stella si può aggiungere solo con rapporto operativo (policy `favorites_insert_operational`), e lo stesso criterio lo usano F, E e altre 4 funzioni DB.
- La classificazione proposta coincide con questa regola sul caso «operativo» e serve solo a scegliere il messaggio: la logica operativa esistente non cambia.

### Come si rimuove oggi una stella
- Scrittura diretta dal browser su `buyer_product_favorites` (DELETE), consentita dalla policy `favorites_delete_own_company`: a qualsiasi **membro** dell'azienda cliente, non solo agli amministratori.
- Nessun trigger e nessun audit.
- La stessa scrittura non si può riusare per la rimozione per fornitore, che richiede amministratore, conteggio confermato, atomicità e audit: serve una funzione nuova (sezione 3).
- Segnalo l'incoerenza: la rimozione singola resta aperta a tutti i membri. Non la cambio senza tua decisione.

## 2. Classificazione

### Stato del rapporto (una riga per coppia)
| Stato | Condizione |
|---|---|
| operativo | `status = 'attivo'` AND seller_enabled AND buyer_enabled |
| in pausa | `status = 'sospeso'`, oppure `'attivo'` con almeno un'abilitazione falsa |
| cessato | `status = 'revocato'` |
| non attivo | `'in_attesa'`, `'rifiutato'` o nessuna riga |

### Motivo per stella (precedenza)
```text
rapporto_cessato > rapporto_non_attivo > non_pubblicato > fornitore_in_pausa
```
Esclusi dall'elenco: articolo pubblicato **e** visibile **e** rapporto operativo.
`also_paused = true` solo con `non_pubblicato` e rapporto in pausa.

### Cosa restituisce la funzione
- `non_pubblicato` e `fornitore_in_pausa`: una riga per articolo, con codice e descrizione.
- `rapporto_cessato` e `rapporto_non_attivo`: una riga di riepilogo per fornitore (id, nome, numero, motivo). Nessun articolo e nessun id di articolo.

## 3. SQL completo (migrazione 0032, NON applicata)
```sql
-- A. Elenco dei preferiti non acquistabili (sola lettura)
CREATE OR REPLACE FUNCTION public.buyer_unpublished_favorites(_buyer_company_id uuid)
RETURNS TABLE (
  row_kind text,              -- 'articolo' | 'fornitore'
  motivo text,                -- 'non_pubblicato' | 'fornitore_in_pausa' | 'rapporto_cessato' | 'rapporto_non_attivo'
  seller_company_id uuid,
  seller_name text,
  favorite_id uuid,           -- solo row_kind = 'articolo'
  product_id uuid,            -- solo row_kind = 'articolo'
  code text,                  -- solo row_kind = 'articolo'
  description text,           -- solo row_kind = 'articolo'
  also_paused boolean,        -- solo row_kind = 'articolo'
  favorites_count integer     -- solo row_kind = 'fornitore'
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Controlli obbligatori: il GRANT non li sostituisce.
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _buyer_company_id IS NULL OR NOT public.is_company_member(_buyer_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  RETURN QUERY
  WITH rel AS (
    -- una riga per coppia (vincolo unico); con più righe vale operativo > pausa > non attivo > cessato
    SELECT r.seller_company_id AS seller_id,
           COALESCE(bool_or(r.status = 'attivo' AND r.seller_enabled = true AND r.buyer_enabled = true), false) AS operativo,
           COALESCE(bool_or(r.status = 'sospeso'
                    OR (r.status = 'attivo' AND (r.seller_enabled IS DISTINCT FROM true OR r.buyer_enabled IS DISTINCT FROM true))), false) AS pausa,
           COALESCE(bool_or(r.status IN ('in_attesa','rifiutato')), false) AS non_attivo
    FROM public.supplier_customer_relations r
    WHERE r.buyer_company_id = _buyer_company_id
    GROUP BY r.seller_company_id
  ),
  base AS (
    SELECT f.id AS fav_id, p.id AS prod_id, f.seller_company_id AS sel_id, c.legal_name AS sel_name,
           p.code AS p_code, p.description AS p_desc,
           COALESCE(p.publish_status = 'pubblicato' AND p.b2b_visible = true, false) AS visibile,
           COALESCE(rel.operativo, false) AS operativo,
           COALESCE(rel.pausa, false) AND NOT COALESCE(rel.operativo, false) AS pausa,
           -- nessuna riga di rapporto = non attivo
           (rel.seller_id IS NULL OR COALESCE(rel.non_attivo, false))
             AND NOT COALESCE(rel.operativo, false) AND NOT COALESCE(rel.pausa, false) AS non_attivo
    FROM public.buyer_product_favorites f
    JOIN public.products p ON p.id = f.product_id AND p.company_id = f.seller_company_id
    JOIN public.companies c ON c.id = f.seller_company_id
    LEFT JOIN rel ON rel.seller_id = f.seller_company_id
    WHERE f.buyer_company_id = _buyer_company_id
  ),
  classed AS (
    SELECT b.*,
           CASE
             WHEN NOT b.operativo AND NOT b.pausa AND NOT b.non_attivo THEN 'rapporto_cessato'
             WHEN b.non_attivo                                         THEN 'rapporto_non_attivo'
             WHEN NOT b.visibile                                       THEN 'non_pubblicato'
             WHEN b.pausa                                              THEN 'fornitore_in_pausa'
             ELSE NULL                                                 -- pubblicato + visibile + operativo
           END AS mot
    FROM base b
  )
  SELECT 'articolo', k.mot, k.sel_id, k.sel_name, k.fav_id, k.prod_id, k.p_code, k.p_desc,
         (k.mot = 'non_pubblicato' AND k.pausa), NULL::integer
  FROM classed k WHERE k.mot IN ('non_pubblicato','fornitore_in_pausa')
  UNION ALL
  SELECT 'fornitore', k.mot, k.sel_id, k.sel_name, NULL, NULL, NULL, NULL, NULL, count(*)::integer
  FROM classed k WHERE k.mot IN ('rapporto_cessato','rapporto_non_attivo')
  GROUP BY k.mot, k.sel_id, k.sel_name
  ORDER BY 1, 2, 4, 7;
END;
$function$;

REVOKE ALL ON FUNCTION public.buyer_unpublished_favorites(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buyer_unpublished_favorites(uuid) TO authenticated;

-- B. Rimozione di tutti i preferiti di un fornitore non più collegato
CREATE OR REPLACE FUNCTION public.remove_seller_favorites(
  _buyer_company_id uuid, _seller_company_id uuid, _expected_count integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_count integer; v_deleted integer; v_operativo boolean; v_pausa boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _buyer_company_id IS NULL OR _seller_company_id IS NULL OR _expected_count IS NULL OR _expected_count < 0 THEN
    RAISE EXCEPTION 'Parametri non validi';
  END IF;
  IF NOT public.is_company_admin(_buyer_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;

  -- solo fornitori non più collegati (cessato / non attivo): mai con rapporto operativo o in pausa
  SELECT COALESCE(bool_or(status = 'attivo' AND seller_enabled = true AND buyer_enabled = true), false),
         COALESCE(bool_or(status = 'sospeso' OR (status = 'attivo' AND (seller_enabled IS DISTINCT FROM true OR buyer_enabled IS DISTINCT FROM true))), false)
    INTO v_operativo, v_pausa
  FROM public.supplier_customer_relations
  WHERE buyer_company_id = _buyer_company_id AND seller_company_id = _seller_company_id;
  IF v_operativo OR v_pausa THEN
    RAISE EXCEPTION 'Il rapporto con questo fornitore è ancora attivo o in pausa: rimuovi i preferiti uno alla volta';
  END IF;

  -- blocco della coppia e delle righe: conteggio e cancellazione nella stessa transazione
  PERFORM pg_advisory_xact_lock(hashtextextended('favorites:'||_buyer_company_id||':'||_seller_company_id, 0));
  SELECT count(*) INTO v_count FROM (
    SELECT 1 FROM public.buyer_product_favorites
    WHERE buyer_company_id = _buyer_company_id AND seller_company_id = _seller_company_id
    FOR UPDATE) s;

  IF v_count <> _expected_count THEN
    -- nessuna scrittura prima di questo RETURN
    RETURN jsonb_build_object('status','count_changed','current_count',v_count,'deleted',0);
  END IF;
  IF v_count = 0 THEN
    RETURN jsonb_build_object('status','nothing_to_delete','current_count',0,'deleted',0);
  END IF;

  DELETE FROM public.buyer_product_favorites
  WHERE buyer_company_id = _buyer_company_id AND seller_company_id = _seller_company_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> v_count THEN
    RAISE EXCEPTION 'Numero di preferiti cambiato durante la rimozione: riprova';  -- annulla tutto
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_buyer_company_id, auth.uid(), 'buyer_favorites.remove_seller', 'company', _seller_company_id,
          jsonb_build_object('seller_company_id', _seller_company_id, 'deleted', v_deleted));

  RETURN jsonb_build_object('status','deleted','current_count',0,'deleted',v_deleted);
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_seller_favorites(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_seller_favorites(uuid, uuid, integer) TO authenticated;
```

Note:
- La rimozione cancella solo righe di `buyer_product_favorites`. Prodotti, collegamenti, ordini, serie prezzi e storico non vengono toccati: nessun'altra tabella dipende dalle stelle tramite FK.
- Una stella nuova si può aggiungere solo con rapporto operativo (policy esistente), quindi su un fornitore cessato o non attivo non ne possono arrivare durante la conferma. Il blocco `FOR UPDATE` copre le rimozioni contemporanee.

## 4. Interfaccia
- Riquadro «Collegamento da completare» con articoli cliccabili; etichetta su card e righe, con qualsiasi filtro.
- Sezione «Articoli non più in catalogo»: stella attiva e rimovibile, nessuna azione di acquisto.
  - `non_pubblicato`: «Il fornitore non pubblica più questo articolo: non è acquistabile finché non torna in catalogo.» Se `also_paused`, aggiunge «Anche il rapporto con il fornitore è in pausa».
  - `fornitore_in_pausa`: «Rapporto con il fornitore in pausa: l'articolo tornerà acquistabile quando il rapporto sarà riattivato.»
- Gruppo «Fornitori non più collegati»: nome del fornitore, numero di preferiti e messaggio.
  - `rapporto_cessato`: «Il rapporto con questo fornitore è terminato: gli articoli non sono acquistabili.»
  - `rapporto_non_attivo`: «Rapporto con il fornitore non attivo: gli articoli non sono acquistabili.»
  - Pulsante «Rimuovi tutti i preferiti di questo fornitore», visibile solo agli amministratori. Apre la conferma «Verranno rimossi N preferiti di [fornitore]. Prodotti, collegamenti, ordini e prezzi non vengono toccati.» e chiama la funzione B con N.
  - Se la risposta è `count_changed`, la conferma si riapre con il nuovo numero.

## 5. File da modificare (dopo l'autorizzazione)
| File | Modifica |
|---|---|
| migrazione 0032 | SQL della sezione 3 (A e B) |
| `src/components/catalog/catalog-list.tsx` | prop facoltativa `linkPending?: Set<string>` ed etichetta accanto alla stella (vista tabella e vista card) |
| `src/routes/_authenticated/acquisti.catalogo.index.tsx` | link nel riquadro, `linkPending`, sezione e gruppo della sezione 4, conferma della rimozione |
| AGENTS.md | regola: preferiti non acquistabili letti solo con buyer_unpublished_favorites (precedenza dei motivi); rimozione per fornitore solo con remove_seller_favorites (amministratore, conteggio confermato) |

## 6. Prove (transazione annullata con RAISE finale, nessun dato reale modificato)
**Lettura (A)**
1. 3 EMME per 3 EMME → 2 righe articolo `non_pubblicato` (1803, 1812), `also_paused = false`, nessuna riga fornitore.
2. Le 16 stelle pubblicate con rapporto operativo → assenti.
3. Senza autenticazione → errore. Ruolo anon → manca il permesso (`has_function_privilege`).
4. trevi srl con l'id di 3 EMME → errore; 3 EMME con l'id di trevi → errore; membro di 3 EMME disattivato → errore.
5. Stella di prova con `seller_company_id` diverso dal proprietario del prodotto → esclusa.
6. Pausa (`seller_enabled = false`, poi `buyer_enabled = false`, poi `status = 'sospeso'`) → le pubblicate diventano `fornitore_in_pausa`; 1803/1812 restano `non_pubblicato` con `also_paused = true`.
7. `revocato` → una riga fornitore `rapporto_cessato` con 18 stelle, nessun codice.
8. `in_attesa` e `rifiutato` → una riga fornitore `rapporto_non_attivo` con 18 stelle.
9. Nessuna riga di rapporto (cancellata nella transazione) → `rapporto_non_attivo`.
10. Più righe per la stessa coppia: impossibile, l'INSERT viene rifiutato da `relations_unique_pair` (prova che lo conferma).
11. Articolo ripubblicato con rapporto operativo → sparisce dall'elenco.
12. NULL: oggi impossibili sulle colonne NOT NULL (lo conferma un tentativo di UPDATE a NULL, rifiutato). Il caso «nessun rapporto» copre il NULL da LEFT JOIN.
13. Colonne restituite: esattamente le 10 dichiarate, nessun prezzo o immagine.

**Rimozione (B)**

14. Rapporto operativo → errore, 0 righe cancellate.
15. Rapporto in pausa → errore.
16. `revocato`, numero corretto (18) → `deleted` = 18, 1 voce di audit con deleted = 18; prodotti, collegamenti, ordini e serie prezzi invariati.
17. `revocato`, numero sbagliato (17) → `count_changed`, current_count = 18, 0 cancellate, nessun audit.
18. Numero cambiato dopo la lettura (una stella tolta nella transazione, poi conferma con 18) → `count_changed` con 17.
19. Utente non amministratore di 3 EMME → errore (utente di prova reso operatore nella transazione).
20. trevi srl su 3 EMME → errore; stelle di altre aziende mai toccate (conteggio prima/dopo).
21. Numero negativo o parametri NULL → errore.

**Regressioni**

22. Typecheck pulito, build OK, nessuna richiesta di scrittura durante le prove nel browser.
23. Come 3 EMME a 1280 e 390 px: 3 link, etichetta solo sui 3 articoli anche con i filtri, sezione con i 2 articoli e il messaggio giusto.
24. Ordini, Ordini clienti e Prodotti del fornitore si aprono senza errori.

## 7. Stato delle verifiche
- Finestra di modifica diretta di un ordine cliente: **NON VERIFICATA**. Non ci sono ordini modificabili direttamente e non creo ordini di prova.
- Rimozione singola della stella: oggi aperta a tutti i membri (vedi sezione 1). Da decidere se allinearla agli amministratori.
