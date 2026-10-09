# Catalogo: preferiti non acquistabili (v3, NON applicato)

Rispetto alla v2 cambiano solo la funzione B (ordine dei blocchi), le note sulla concorrenza e le prove. La funzione A e l'interfaccia restano come nella v2. La rimozione singola della stella resta com'è oggi (membri dell'azienda).

## 1. Precedenza dei rapporti: verifica con righe fittizie (VALUES, nessun dato toccato)
La query usa le stesse espressioni della funzione A, con la stessa CTE `rel` e la stessa classificazione.

```sql
WITH r(caso, status, seller_enabled, buyer_enabled) AS (VALUES
 ('A operativo+revocato','attivo',true,true),('A operativo+revocato','revocato',true,true),
 ('B pausa+revocato','attivo',false,true),('B pausa+revocato','revocato',true,true),
 ('C in_attesa+revocato','in_attesa',true,true),('C in_attesa+revocato','revocato',true,true),
 ('D solo revocato','revocato',true,true),
 ('E sospeso+rifiutato','sospeso',true,true),('E sospeso+rifiutato','rifiutato',true,true),
 ('F nessuna riga',NULL,NULL,NULL)),
rel AS (
 SELECT caso, bool_or(status IS NOT NULL) AS has_row,
  COALESCE(bool_or(status = 'attivo' AND seller_enabled = true AND buyer_enabled = true), false) AS operativo,
  COALESCE(bool_or(status = 'sospeso' OR (status = 'attivo' AND (seller_enabled IS DISTINCT FROM true OR buyer_enabled IS DISTINCT FROM true))), false) AS pausa,
  COALESCE(bool_or(status IN ('in_attesa','rifiutato')), false) AS non_attivo
 FROM r GROUP BY caso),
art(visibile) AS (VALUES (true),(false)),
base AS (
 SELECT rel.caso, art.visibile, rel.operativo,
  rel.pausa AND NOT rel.operativo AS pausa,
  (NOT rel.has_row OR rel.non_attivo) AND NOT rel.operativo AND NOT rel.pausa AS non_attivo
 FROM rel CROSS JOIN art)
SELECT caso, CASE WHEN visibile THEN 'pubblicato' ELSE 'non pubblicato' END AS articolo,
 COALESCE(CASE
  WHEN NOT operativo AND NOT pausa AND NOT non_attivo THEN 'rapporto_cessato'
  WHEN non_attivo THEN 'rapporto_non_attivo'
  WHEN NOT visibile THEN 'non_pubblicato'
  WHEN pausa THEN 'fornitore_in_pausa' END, '(escluso: acquistabile)') AS motivo,
 (NOT visibile AND pausa) AS also_paused
FROM base ORDER BY 1,2;
```

| caso | articolo | motivo | also_paused |
|---|---|---|---|
| A operativo+revocato | non pubblicato | non_pubblicato | f |
| A operativo+revocato | pubblicato | (escluso: acquistabile) | f |
| B pausa+revocato | non pubblicato | non_pubblicato | **t** |
| B pausa+revocato | pubblicato | fornitore_in_pausa | f |
| C in_attesa+revocato | non pubblicato | rapporto_non_attivo | f |
| C in_attesa+revocato | pubblicato | rapporto_non_attivo | f |
| D solo revocato | non pubblicato | rapporto_cessato | f |
| D solo revocato | pubblicato | rapporto_cessato | f |
| E sospeso+rifiutato | non pubblicato | non_pubblicato | t |
| E sospeso+rifiutato | pubblicato | fornitore_in_pausa | f |
| F nessuna riga | non pubblicato | rapporto_non_attivo | f |
| F nessuna riga | pubblicato | rapporto_non_attivo | f |

Esito: la precedenza operativo > in pausa > non attivo > cessato è rispettata in tutti i casi richiesti. La logica non è stata riscritta.

## 2. Concorrenza: cosa fanno oggi le operazioni sui rapporti

### Come nasce un rapporto
| Funzione / flusso | Stato iniziale |
|---|---|
| `invite_customer_relation`, `request_supplier_relation` | `in_attesa` |
| `accept_invitation_row`, `accept_invitation_with_new_company` | **`attivo` con le due abilitazioni a true**: nasce già operativo. Se la riga esiste (anche `revocato`), la riporta direttamente ad `attivo` |
| `decide_company_relation` | da `in_attesa` ad `attivo` o `rifiutato` |
| `set_relation_side_enabled` | pausa o riattivazione di un lato (solo su `attivo`) |
| `revoke_company_relation` | `revocato` |
| scrittura diretta dal browser | consentita dalle policy `relations_insert_admin` / `relations_update_admin` / `relations_update_supplier_admin` |

- Nessuna di queste funzioni usa blocchi consultivi né `FOR UPDATE` sul rapporto: il blocco consultivo della funzione B le **non** coinvolge.
- Le righe dei rapporti non vengono mai cancellate (non esiste nessuna policy DELETE), e il vincolo unico ammette una sola riga per coppia.
- Una stella si può aggiungere solo con rapporto operativo: la policy `favorites_insert_operational` richiede `is_company_member(buyer) AND relation_is_operational(seller, buyer)`. Confermato.

### Protezione nella funzione B (v3)
Ordine dei passi:
1. Blocco consultivo della coppia.
2. `SELECT ... FROM supplier_customer_relations ... FOR SHARE` sulla riga del rapporto (se esiste); solo dopo il calcolo di operativo/pausa.
3. `FOR UPDATE` sulle stelle, poi conteggio, confronto con il numero confermato, DELETE e controllo di ROW_COUNT.

`FOR SHARE` va in conflitto con qualsiasi UPDATE della riga. Quindi accettazione, riattivazione, pausa o revoca dello stesso rapporto aspettano la fine della rimozione. Se una di queste era già confermata, la funzione B legge lo stato nuovo e si ferma con un errore.

### Casi concorrenti
| Caso | Esito |
|---|---|
| Rapporto riattivato **durante** la rimozione (la riga esiste) | la riattivazione aspetta: le stelle vengono rimosse mentre il rapporto è ancora cessato o non attivo, poi la riattivazione prosegue. Se la riattivazione era già confermata, B si ferma («ancora attivo o in pausa»), 0 cancellate |
| Rapporto **inesistente** creato da un'altra sessione durante la rimozione | `FOR SHARE` non blocca una riga che non esiste ancora. In pratica: senza nessuna riga di rapporto non ci possono essere stelle (si aggiungono solo con rapporto operativo e le righe non si cancellano), quindi il conteggio è 0 e non si cancella nulla. **Rischio residuo teorico**: stelle orfane create fuori dall'app, che verrebbero rimosse mentre nasce il rapporto |
| Rapporto `in_attesa` accettato durante la rimozione | la riga esiste, quindi vale il primo caso: protetto |
| Un altro membro toglie una stella durante la rimozione | se la toglie prima del nostro blocco, il conteggio cambia → `count_changed`, 0 cancellate, nuova conferma. Se la toglie dopo, la sua cancellazione aspetta e alla fine non trova più la riga |
| Due amministratori insieme | il blocco consultivo li mette in fila. Il secondo trova 0 stelle → `count_changed` con 0, e l'interfaccia mostra «già rimossi» |
| Stella aggiunta durante la rimozione | impossibile: il rapporto non è operativo (policy) e la riga del rapporto è bloccata |

Soluzione completa per il caso «rapporto inesistente» (NON proposta ora): far prendere lo stesso blocco consultivo `'favorites:'||buyer||':'||seller` anche alle funzioni che inseriscono o attivano i rapporti, e togliere la scrittura diretta dal browser sulle policy dei rapporti. Richiede di modificare 7 funzioni e 3 policy. Rischio residuo senza questa modifica: al massimo la perdita di stelle (si possono rimettere), mai di prodotti, collegamenti, ordini o prezzi.

### audit_events (schema reale)
- Colonne: `company_id` uuid (FK companies, ammette NULL), `actor_user_id` uuid, `action` text NOT NULL, `entity_type` text NOT NULL, `entity_id` uuid, `detail` jsonb.
- `entity_type` è testo libero, senza CHECK né enum. Valori presenti oggi: product, supplier_record, customer_record, shopping_list, inventory_session, product_supplier_link, unit_of_measure, purchase_order, company, invitation, relation, danea_station, danea_archive, purchase_delivery, purchase_delivery_item, shopping_list_item.
- `'company'` con `entity_id` = id dell'azienda è già usato (`company.registered`). L'INSERT di B rispetta colonne, tipi e vincoli.

## 3. SQL completo (migrazione 0032, NON applicata)

### A. buyer_unpublished_favorites: invariata rispetto alla v2
```sql
CREATE OR REPLACE FUNCTION public.buyer_unpublished_favorites(_buyer_company_id uuid)
RETURNS TABLE (
  row_kind text, motivo text, seller_company_id uuid, seller_name text,
  favorite_id uuid, product_id uuid, code text, description text,
  also_paused boolean, favorites_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _buyer_company_id IS NULL OR NOT public.is_company_member(_buyer_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  RETURN QUERY
  WITH rel AS (
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
             ELSE NULL
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
```

### B. remove_seller_favorites (v3: blocchi prima del controllo)
```sql
CREATE OR REPLACE FUNCTION public.remove_seller_favorites(
  _buyer_company_id uuid, _seller_company_id uuid, _expected_count integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_count integer; v_deleted integer;
  v_operativo boolean := false; v_pausa boolean := false;
  v_rel record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _buyer_company_id IS NULL OR _seller_company_id IS NULL OR _expected_count IS NULL OR _expected_count < 0 THEN
    RAISE EXCEPTION 'Parametri non validi';
  END IF;
  IF NOT public.is_company_admin(_buyer_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;

  -- 1. blocco consultivo della coppia (mette in fila le rimozioni contemporanee)
  PERFORM pg_advisory_xact_lock(hashtextextended('favorites:'||_buyer_company_id||':'||_seller_company_id, 0));

  -- 2. blocco della riga del rapporto (se esiste), poi calcolo dello stato
  FOR v_rel IN
    SELECT status, seller_enabled, buyer_enabled
    FROM public.supplier_customer_relations
    WHERE buyer_company_id = _buyer_company_id AND seller_company_id = _seller_company_id
    FOR SHARE
  LOOP
    v_operativo := v_operativo OR COALESCE(v_rel.status = 'attivo' AND v_rel.seller_enabled = true AND v_rel.buyer_enabled = true, false);
    v_pausa := v_pausa OR COALESCE(v_rel.status = 'sospeso'
               OR (v_rel.status = 'attivo' AND (v_rel.seller_enabled IS DISTINCT FROM true OR v_rel.buyer_enabled IS DISTINCT FROM true)), false);
  END LOOP;
  IF v_operativo OR v_pausa THEN
    RAISE EXCEPTION 'Il rapporto con questo fornitore è ancora attivo o in pausa: rimuovi i preferiti uno alla volta';
  END IF;

  -- 3. blocco delle stelle, confronto con il numero confermato
  SELECT count(*) INTO v_count FROM (
    SELECT 1 FROM public.buyer_product_favorites
    WHERE buyer_company_id = _buyer_company_id AND seller_company_id = _seller_company_id
    FOR UPDATE) s;

  IF v_count <> _expected_count THEN
    RETURN jsonb_build_object('status','count_changed','current_count',v_count,'deleted',0);  -- nessuna scrittura prima
  END IF;
  IF v_count = 0 THEN
    RETURN jsonb_build_object('status','nothing_to_delete','current_count',0,'deleted',0);
  END IF;

  DELETE FROM public.buyer_product_favorites
  WHERE buyer_company_id = _buyer_company_id AND seller_company_id = _seller_company_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> v_count THEN
    RAISE EXCEPTION 'Numero di preferiti cambiato durante la rimozione: riprova';  -- dopo una scrittura solo RAISE
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

## 4. Interfaccia e file: invariati rispetto alla v2
- Riquadro con link, etichetta su card e righe, sezione «Articoli non più in catalogo», gruppo «Fornitori non più collegati» con «Rimuovi tutti i preferiti di questo fornitore» (solo amministratori, con conferma del numero e nuova conferma se il numero cambia).
- File: migrazione 0032, `catalog-list.tsx`, `acquisti.catalogo.index.tsx`, AGENTS.md (una regola per A e una per B).

## 5. Prove (transazione annullata con RAISE finale, nessun dato reale modificato)
**A: lettura**
1. 3 EMME per 3 EMME → 2 righe `non_pubblicato` (1803, 1812), `also_paused = false`.
2. Le 16 stelle acquistabili → assenti.
3. Senza autenticazione → errore. Ruolo anon → manca il permesso (`has_function_privilege`).
4. trevi srl con l'id di 3 EMME → errore; 3 EMME con l'id di trevi → errore; membro disattivato → errore.
5. Stella con `seller_company_id` diverso dal proprietario del prodotto → esclusa.
6. Pausa (`seller_enabled = false` / `buyer_enabled = false` / `sospeso`) → `fornitore_in_pausa`; 1803/1812 → `non_pubblicato` con `also_paused = true`.
7. `revocato` → una riga fornitore `rapporto_cessato` con 18, senza codici.
8. `in_attesa` / `rifiutato` → riga fornitore `rapporto_non_attivo` con 18.
9. Più righe per la stessa coppia → verificato con VALUES (sezione 1); con i dati reali è impossibile per via del vincolo unico.
10. Articolo ripubblicato con rapporto operativo → sparisce dall'elenco.
11. Colonne restituite: esattamente 10, nessun prezzo o immagine.

**B: rimozione**

12. Rapporto operativo → errore, 0 cancellate.
13. Rapporto in pausa (ognuna delle 3 forme) → errore.
14. `revocato`, numero 18 → 18 cancellate, 1 voce di audit (entity_type `company`, entity_id = fornitore, deleted 18); prodotti, collegamenti, ordini e serie prezzi invariati.
15. `revocato`, numero 17 → `count_changed` con 18, 0 cancellate, nessun audit.
16. Una stella tolta dopo la lettura, conferma con 18 → `count_changed` con 17.
17. Seconda chiamata dopo la rimozione → `count_changed` con 0.
18. Operatore non amministratore → errore. trevi srl su 3 EMME → errore. Stelle di altre aziende intatte.
19. Parametri NULL o numero negativo → errore.
20. `in_attesa` → rimozione consentita (rapporto non attivo).

**Concorrenza (due sessioni reali)**: **NON eseguibili** in questo ambiente. Le prove sul database girano in una sola sessione per volta e il ruolo di sola lettura non può eseguire funzioni, quindi non posso tenere aperte due transazioni insieme. Le prove 21–23 restano **NON VERIFICATE**:
21. Riattivazione durante la rimozione → atteso: la riattivazione aspetta, oppure B si ferma se la riattivazione era già confermata. Garanzia dal `FOR SHARE`.
22. Due amministratori insieme → atteso: in fila, il secondo riceve `count_changed` con 0. Garanzia dal blocco consultivo.
23. Rimozione singola durante la rimozione → atteso: `count_changed`, oppure la cancellazione singola aspetta. Garanzia dal `FOR UPDATE`.

Resta non coperto il rapporto inesistente creato durante la rimozione (sezione 2, rischio residuo).

**Regressioni**

24. Typecheck pulito, build OK; nessuna scrittura durante le prove nel browser.
25. Come 3 EMME a 1280 e 390 px: 3 link, etichetta solo sui 3 articoli anche con i filtri, sezione con i 2 articoli e il messaggio giusto.
26. Ordini, Ordini clienti e Prodotti del fornitore si aprono senza errori.

## 6. Stato delle verifiche
- Finestra di modifica diretta di un ordine cliente: **NON VERIFICATA** (non ci sono ordini modificabili e non creo ordini di prova).
