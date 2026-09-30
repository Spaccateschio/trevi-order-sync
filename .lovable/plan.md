# U.M. libera nella zona «Da acquistare»

## Obiettivo
Nella zona DA ACQUISTARE della card: `[ quantità ] [ U.M. ▼ ] [ Conferma ]`. La U.M. si può scegliere sempre, anche senza conversione. Mai inventare conversioni: senza conversione la quantità resta nella U.M. scelta e basta («3 casse · Non convertibile»), senza forzarla in kg/pz.

## Regole fisse (dalle tue indicazioni)
- La conversione NON è obbligatoria per acquistare.
- Se esiste conversione (es. 1 cassa = 10 kg): mostro «3 casse ≈ 30 kg».
- Se non esiste: «3 casse · Non convertibile», nessun valore inventato (mai 0 kg, mai 3 kg).
- I tasti rapidi seguono la U.M. scelta: con CASSA → +1 cs +3 cs…, con KG → +1 kg…
- La U.M. scelta resta associata alla quantità salvata.
- Ricevimento merce/DDT/fattura NON toccati ora; il dato resta compatibile con quel flusso futuro.

## Modifica database (migration)
1. `shopping_list_items`: aggiungo due colonne nullable:
   - `decided_unit_id uuid REFERENCES units_of_measure(id)` — U.M. scelta per la quantità da acquistare (NULL = U.M. del prodotto, come oggi);
   - `decided_unit_code text` — fotografia del codice (es. «cs», «kg»).
   Righe esistenti: restano NULL → comportamento invariato.
2. `set_shopping_list_item_quantity`: nuovo parametro `_decided_unit_id`/`_decided_unit_code`; salva la U.M. insieme alla quantità. Se la U.M. è quella del prodotto, salva NULL (nessun dato inutile).
3. `confirm_shopping_list_product`: nessun cambiamento di logica (blocca la quantità come oggi); la U.M. scelta resta salvata sulla riga.
4. `shopping_list_item_state` (stato Da assegnare/Parziale/Assegnata): il confronto con le ripartizioni resta in U.M. prodotto quando la quantità decisa è convertibile; se la U.M. decisa non è convertibile, lo stato si basa solo sulla presenza di ripartizioni valide (mai su somme inventate).
5. `create_purchase_orders_from_list`: invariato (ordina dalle ripartizioni fornitore, come oggi).

## Interfaccia (shopping-list-card.tsx + shopping-list-panel.tsx)
- Zona DA ACQUISTARE: campo quantità + menu a tendina U.M. + Conferma.
  - Il menu propone: U.M. del prodotto (sempre) + le U.M. d'acquisto configurate sui fornitori collegati al prodotto + «Altra U.M.» (testo libero normalizzato, come nelle ripartizioni).
  - Default: U.M. del prodotto (comportamento identico a oggi finché non cambi scelta).
- Tasti rapidi +1/+3/+5/+10 con il codice della U.M. selezionata.
- Se la U.M. scelta ha conversione verso l'U.M. prodotto, mostro l'equivalente «≈ 30 kg»; altrimenti «Non convertibile» (solo informativo, non blocca).
- Riepilogo «Assegnato X / Y»: se la quantità decisa non è in U.M. prodotto e non è convertibile, il totale mostra le ripartizioni per quello che sono, senza somme forzate.

## Cosa NON tocco
- Ripartizioni fornitore (già funzionano così: U.M. libera, conversione facoltativa).
- Ordini, Consegne, Carico Merce, DDT, fatture.
- Inventario, Fabbisogno, semaforo, stato «Da assegnare» come concetto.
- Conferma/Sblocca, card ocra, preferiti.

## Verifica
- Prove in transazione annullata sul database (nessun dato reale modificato): quantità in U.M. prodotto, in U.M. fornitore con conversione, in U.M. senza conversione, «Altra U.M.».
- Verifica in pagina: menu visibile, tasti rapidi che cambiano codice, conferma e sblocco come prima.
