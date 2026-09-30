# Modifica e Togli sul fornitore nella card

## Cosa cambia per te
**Modifica** apre un solo riquadro con tutto quello che si può cambiare:
- **Fornitore non B2B** (es. Breda): Prezzo, U.M. del prezzo, U.M. d'acquisto (esistente o «Altra U.M.»), Quantità. Salva una volta sola.
- **Fornitore B2B** (es. trevi): solo U.M. d'acquisto (tra quelle pubblicate dal venditore) e Quantità. Il prezzo si vede ma non si modifica: lo decide il venditore.

Prezzo e U.M. d'acquisto si salvano sul collegamento prodotto↔fornitore, quindi valgono anche per le prossime Liste e ordini. La quantità resta dell'acquisto di questa Lista.

**Togli** toglie la quantità da questa Lista **e scollega il fornitore dal prodotto**, dopo una richiesta di conferma («Togliere Breda da questo prodotto? Non comparirà più nelle prossime Liste»). Il menu ⋮ resta com'è.

## Cosa non cambia
Regole di salvataggio della ripartizione, conversioni, U.M. B2B decise dal venditore, Conferma/Sblocca, colore ocra, «Da acquistare», Ordini, Consegne, Carico Merce.

## Dettagli tecnici
- Solo `src/components/shopping/card-suppliers.tsx`.
- Salva di Modifica: per non B2B `manage_product_supplier_link` `_action "update"` (`_manual_cost`, `_price_unit_id`) + `manage_product_supplier_link_unit` add/set_default se cambia l'U.M. d'acquisto; poi la stessa `assignShoppingListSupplier` di oggi per quantità+U.M. B2B: solo `assignShoppingListSupplier`.
- Togli: rimozione ripartizione esistente, poi `manage_product_supplier_link` `_action "deactivate"`; se la seconda fallisce, messaggio chiaro e ripartizione già tolta.
- Verifica in transazione annullata/scollegamento del fornitore di prova, nessun dato reale modificato.
