# Completamento interfaccia Catalogo + funzione buyer_unpublished_favorites (NON applicato)

## 1. Interfaccia (approvata come impostazione)
- Riquadro «Collegamento da completare»: ogni articolo diventa un link alla sua scheda.
- Etichetta «Collegamento da completare» su card e righe del Catalogo, accanto alla stella, con qualsiasi filtro.
- Sezione «Articoli non più in catalogo», sotto l'elenco: stella attiva e rimovibile, nessuna azione di acquisto (niente «Aggiungi ai miei prodotti», Lista od ordini). Un messaggio per ogni motivo:

| motivo | Messaggio |
|---|---|
| `non_pubblicato` | «Il fornitore non pubblica più questo articolo: non è acquistabile finché non torna in catalogo.» |
| `fornitore_in_pausa` | «Rapporto con il fornitore in pausa: l'articolo tornerà acquistabile quando il rapporto sarà riattivato.» |
| `rapporto_cessato` | gruppo separato, «Fornitori non più collegati»: «Il rapporto con questo fornitore è terminato: l'articolo non è acquistabile.» |

Quando valgono sia `non_pubblicato` sia la pausa, sotto il messaggio compare la riga aggiuntiva «Anche il rapporto con il fornitore è in pausa» (campo `also_paused`).

### Precedenza (una sola riga per preferito)
```text
rapporto_cessato  >  non_pubblicato  >  fornitore_in_pausa
```
- **Cessato prima di tutto:** senza rapporto non si acquista comunque, qualunque sia lo stato dell'articolo. È un caso definitivo e non si confonde con la pausa.
- **Non pubblicato prima della pausa:** quando la pausa finisce l'articolo resta non acquistabile. Il motivo più duraturo è quello utile all'operatore; la pausa resta indicata da `also_paused`.

### Stato del rapporto (per azienda cliente + venditore; si valutano tutte le righe del rapporto)
- **operativo:** almeno una riga `status = 'attivo'` con `seller_enabled` e `buyer_enabled` (stesso criterio di `relation_is_operational`).
- **in pausa:** nessuna riga operativa, ma almeno una riga `status = 'sospeso'`, oppure `'attivo'` con una delle due abilitazioni a false.
- **cessato:** nessuna riga operativa né in pausa (solo `revocato`, `rifiutato`, `in_attesa`, oppure nessuna riga).

## 2. SQL completo (migrazione 0032, NON applicata)
```sql
CREATE OR REPLACE FUNCTION public.buyer_unpublished_favorites(_buyer_company_id uuid)
RETURNS TABLE (
  favorite_id uuid,
  product_id uuid,
  seller_company_id uuid,
  seller_name text,
  code text,
  description text,
  motivo text,          -- 'rapporto_cessato' | 'non_pubblicato' | 'fornitore_in_pausa'
  also_paused boolean,  -- true solo con motivo 'non_pubblicato' e rapporto in pausa
  favorited_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Controlli obbligatori: il GRANT non li sostituisce.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  IF _buyer_company_id IS NULL OR NOT public.is_company_member(_buyer_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  RETURN QUERY
  WITH rel AS (
    SELECT r.seller_company_id AS seller_id,
           bool_or(r.status = 'attivo' AND r.seller_enabled AND r.buyer_enabled) AS operativo,
           bool_or(r.status = 'sospeso'
                   OR (r.status = 'attivo' AND NOT (r.seller_enabled AND r.buyer_enabled))) AS pausa
    FROM public.supplier_customer_relations r
    WHERE r.buyer_company_id = _buyer_company_id
    GROUP BY r.seller_company_id
  ),
  base AS (
    SELECT f.id AS fav_id, p.id AS prod_id, f.seller_company_id AS sel_id,
           c.legal_name AS sel_name, p.code AS p_code, p.description AS p_desc,
           f.created_at AS fav_at,
           (p.publish_status = 'pubblicato' AND p.b2b_visible) AS visibile,
           COALESCE(rel.operativo, false) AS operativo,
           COALESCE(rel.pausa, false) AND NOT COALESCE(rel.operativo, false) AS pausa
    FROM public.buyer_product_favorites f
    JOIN public.products p
      ON p.id = f.product_id
     AND p.company_id = f.seller_company_id          -- venditore del preferito = proprietario del prodotto
    JOIN public.companies c ON c.id = f.seller_company_id
    LEFT JOIN rel ON rel.seller_id = f.seller_company_id
    WHERE f.buyer_company_id = _buyer_company_id     -- solo i preferiti dell'azienda richiesta
  )
  SELECT b.fav_id, b.prod_id, b.sel_id, b.sel_name, b.p_code, b.p_desc,
         CASE
           WHEN NOT b.operativo AND NOT b.pausa THEN 'rapporto_cessato'
           WHEN NOT b.visibile                  THEN 'non_pubblicato'
           ELSE                                      'fornitore_in_pausa'
         END,
         (b.visibile = false AND b.pausa),
         b.fav_at
  FROM base b
  WHERE NOT (b.visibile AND b.operativo)            -- esclusi gli articoli pubblicati, visibili e con rapporto operativo
  ORDER BY 7, b.sel_name, b.p_code;
END;
$function$;

REVOKE ALL ON FUNCTION public.buyer_unpublished_favorites(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buyer_unpublished_favorites(uuid) TO authenticated;
```

## 3. Controlli di sicurezza (requisito → come è garantito)
| Requisito | Garanzia |
|---|---|
| Solo utenti autenticati | `auth.uid() IS NULL` → errore; EXECUTE revocato a PUBLIC e anon |
| Solo membri dell'azienda cliente | `is_company_member(_buyer_company_id)`: membro **attivo** di quell'azienda, ricavato da auth.uid() e non dal browser |
| Nessun accesso ai preferiti di altre aziende | lo stesso controllo: un id di un'altra azienda → errore, nessuna riga |
| Solo articoli nei nostri preferiti | si parte da `buyer_product_favorites` filtrato su `buyer_company_id = _buyer_company_id` |
| Venditore del preferito = proprietario del prodotto | `p.company_id = f.seller_company_id` nella JOIN: le righe incoerenti vengono escluse |
| Nessun prezzo, immagine o dato riservato | colonne restituite fisse: id, codice, descrizione, ragione sociale del venditore, motivo, data della stella. Nessuna lettura di prezzi, listini, immagini, giacenze, note o costi |
| Esclusi gli articoli pubblicati e visibili | `WHERE NOT (visibile AND operativo)` |
| Rapporto operativo | stesso criterio di `relation_is_operational`; pausa e cessazione distinte come in sezione 1 |
| Funzione | SECURITY DEFINER, `search_path = public`, STABLE, sola lettura (nessun INSERT/UPDATE/DELETE) |

Effetto sul resto dell'app: nessuno. Le regole di accesso ai prodotti non cambiano. Il cliente vede soltanto codice e descrizione degli articoli che **lui stesso** aveva messo tra i preferiti. Il blocco degli acquisti resta quello di oggi: F e la Lista leggono solo articoli pubblicati con rapporto operativo.

Rischio da segnalare: nei casi `fornitore_in_pausa` e `rapporto_cessato` la funzione restituisce codice e descrizione anche quando il fornitore non è più collegato. Sono dati che il cliente aveva già visto quando ha messo la stella; se preferisci nasconderli nel caso «cessato», posso restituire solo il nome del fornitore e il numero di articoli.

## 4. Prove previste (tutte in una transazione annullata, nessun dato reale modificato)
1. 3 EMME (amministratore) per 3 EMME → 2 righe `non_pubblicato` (1803, 1812), `also_paused = false`.
2. Le 16 stelle su articoli pubblicati con rapporto operativo → assenti.
3. Utente non autenticato (claims vuoti) → errore «Accesso non consentito».
4. Ruolo anon → manca il permesso di EXECUTE (controllo su `has_function_privilege`).
5. trevi srl (altra azienda) con l'id di 3 EMME → errore, 0 righe.
6. 3 EMME con l'id di trevi srl → errore.
7. Membro disattivato di 3 EMME (status cambiato solo dentro la transazione) → errore.
8. Stella di prova con `seller_company_id` diverso dal proprietario del prodotto → esclusa.
9. Rapporto in pausa (`seller_enabled = false` nella transazione): le stelle su articoli pubblicati → `fornitore_in_pausa`; 1803/1812 → `non_pubblicato` con `also_paused = true`.
10. Rapporto `sospeso` → stesso risultato della prova 9.
11. Rapporto `revocato` → tutte le 18 stelle → `rapporto_cessato`.
12. Articolo ripubblicato (nella transazione) con rapporto operativo → sparisce dall'elenco.
13. Colonne restituite: esattamente le 9 elencate, nessuna di prezzo o immagine.
14. Dopo la transazione: 18 stelle, rapporto, prodotti e membri invariati.

## 5. File da modificare (dopo l'autorizzazione)
| File | Modifica |
|---|---|
| migrazione 0032 | SQL della sezione 2 |
| `src/components/catalog/catalog-list.tsx` | prop facoltativa `linkPending?: Set<string>`; etichetta accanto alla stella (vista tabella e vista card) |
| `src/routes/_authenticated/acquisti.catalogo.index.tsx` | link nel riquadro; `linkPending` passato all'elenco; sezione «Articoli non più in catalogo» con i tre messaggi e il gruppo «Fornitori non più collegati»; stella solo rimovibile |
| AGENTS.md | una riga: preferiti non acquistabili letti solo con buyer_unpublished_favorites, con la precedenza `rapporto_cessato > non_pubblicato > fornitore_in_pausa` |

Senza modifiche: scheda articolo, `$sellerId.index.tsx`, `catalog-favorites.ts`, Lista, Inventario, Ordini, E/F.

## 6. Controlli contro le regressioni (interfaccia)
- Typecheck pulito e build OK.
- Come 3 EMME, a 1280 e a 390 px:
  - 3 link funzionanti;
  - etichetta solo sui 3 articoli, anche con i filtri;
  - sezione con i 2 articoli e il messaggio `non_pubblicato`, nessun pulsante di acquisto.
- Nessuna scrittura durante le prove: le chiamate di modifica vengono bloccate nello script e la stella non viene cliccata.
- Pagine Ordini, Ordini clienti e Prodotti del fornitore: si aprono senza errori.

## 7. Stato delle verifiche
- Finestra di modifica diretta di un ordine cliente: **NON VERIFICATA**. Non esiste un ordine modificabile direttamente e non creo ordini di prova. La finestra «Chiedi modifica» di ORD-2026-00003 si apre senza errori; l'ho chiusa senza scrivere né salvare.
