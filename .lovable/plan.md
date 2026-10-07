# Passo 2 — piano operativo: configurazione U.M. nella scheda prodotto

Serve solo a configurare i dati. Inventario, calcolo giacenza, Carico merce, Lista della Spesa, Ordini e sincronizzazione Danea **non cambiano**. I nuovi dati vengono salvati ma letti solo dal Passo 3 in poi.

## Rischio da decidere prima di partire
Nel tab «Inventario» della scheda prodotto c'è già un campo **«U.M. di riferimento»** delle impostazioni scorta (scorta minima, multiplo di riordino), che oggi alimenta anche il vecchio selettore dell'Inventario. Accanto alla nuova «U.M. di magazzino» creerebbe confusione. Proposta: nascondere quel campo e mostrare la scorta minima nella U.M. di magazzino. Il dato vecchio resta salvato, inutilizzato e segnato come deprecato. Lo faccio solo con il tuo consenso.

## A. U.M. di magazzino (tab «Inventario», in cima)
```text
U.M. Danea: kg          (solo lettura, informativa)
U.M. di magazzino: [ pz ▼ ]   Base dal: 07/10/2026
```
- Legge e salva `products.stock_unit_id`. La modifica è riservata all'amministratore: il controllo lo fa il database, non il browser.
- Se la U.M. Danea è diversa, compare un'etichetta «diversa da Danea». È solo informativa.
- Il cambio è bloccato se c'è un inventario in corso. Messaggio: «Chiudi o annulla l'inventario in corso prima di cambiare la U.M. di magazzino».
- Conferma obbligatoria con il testo che hai indicato: «Stai cambiando la U.M. di magazzino. La giacenza attuale non verrà convertita e resterà "Da verificare" finché non verrà effettuato un nuovo conteggio. Continuare?» Il messaggio aggiunge che i vecchi conteggi non vengono convertiti e che servirà un nuovo conteggio fisico.
- Al salvataggio: nuova `stock_base_at = ora`, registrazione nel registro attività (U.M. vecchia → nuova, utente, data).
- Prima assegnazione su un prodotto senza U.M.: stessa conferma, perché nasce comunque una nuova base.

## B. Confezioni (stesso tab, sotto)
| Nome | U.M. confezione | Equivale a | Stato |
|---|---|---|---|
| Cassa 6 bt | cs | 6 bt | attiva |
| Cassa 12 bt | cs | 12 bt | attiva |
| Vaschetta 500 g | vasch | 0,5 kg | attiva |

- Pulsanti «+ Confezione», modifica, attiva/disattiva. Nessuna cancellazione: lo storico può riferirsi a quella confezione.
- La quantità è sempre espressa nella U.M. di magazzino corrente, deve essere maggiore di 0 e rispettare i decimali della U.M. di magazzino.
- Le confezioni sono indipendenti dal fornitore.
- Se cambia la U.M. di magazzino, le confezioni attive vengono segnate «da rivedere» e non sono più utilizzabili finché non le confermi. Non vengono convertite.

## C. Fornitori e conversioni (tab «Acquisto», per ogni U.M. d'acquisto)
```text
Fornitore A   U.M. acquisto: cassa
  Modalità: (•) Fissa   Confezione: [Cassa 6 bt ▼]  → 1 cassa = 6 bt
Fornitore B   U.M. acquisto: cassa
  Modalità: (•) Variabile   Valore indicativo: ≈ 9 kg (non usato per la giacenza)
```
- Modalità:
  - **Stessa**: disponibile solo se la U.M. d'acquisto coincide con la U.M. di magazzino.
  - **Fissa**: confezione oppure fattore obbligatori. Scegliendo la confezione, il fattore viene copiato da quella.
  - **Variabile**: valore indicativo facoltativo; la quantità reale si scrive al carico.
  - **Da configurare**: modalità non ancora impostata.
- I dati esistenti partono da «Da configurare». Nulla viene dedotto automaticamente: il vecchio fattore resta visibile come suggerimento da confermare.
- Per i fornitori B2B si configura solo la propria conversione, non i dati del venditore.

## D. «Configurazione U.M. da completare»
Nuovo filtro nell'elenco Prodotti con una colonna «Motivo». Motivi possibili:
1. U.M. di magazzino mancante.
2. U.M. d'acquisto diversa dalla U.M. di magazzino senza modalità impostata.
3. Modalità «stessa» con U.M. diverse.
4. Conversione fissa senza fattore né confezione.
5. Confezione collegata disattivata o «da rivedere».
6. Confezione o fattore incoerenti con la U.M. di magazzino attuale (dopo un cambio).
7. Fattore non intero su una U.M. di magazzino senza decimali.

Un prodotto può avere più motivi. Il contatore compare sopra l'elenco e il motivo anche nella scheda, in cima al tab «Inventario».

## F. I 2 prodotti «nr»
- Compaiono nel filtro con il motivo «U.M. di magazzino mancante — Danea: nr (non presente nell'elenco U.M.)».
- Nella scheda c'è un campo vuoto con l'avviso. Puoi scegliere una U.M. esistente (es. «pz») oppure prima crearla nell'elenco U.M. aziendale.
- Dopo l'assegnazione: `stock_base_at` impostata e prodotto fuori dal filtro. Nel Passo 3 la giacenza sarà «Da verificare» fino al primo conteggio.

## H. Dettagli tecnici

**Componenti modificati**
- `product-detail-sheet.tsx`: intestazione con U.M. Danea e U.M. di magazzino.
- `product-stock-panel.tsx`: U.M. di magazzino, confezioni e, se approvato, il campo scorta nascosto.
- `product-suppliers-manager.tsx`: modalità, confezione e valore indicativo per ogni U.M. d'acquisto.
- `products-workspace.tsx` e `src/lib/product-grid.ts`: filtro e colonna «Motivo».
- Nuovo `src/components/products/stock-packages-manager.tsx`.
- Nuovo `src/lib/stock-unit.functions.ts`.
- `AGENTS.md`, `roadmap.md`.

**Funzioni nel database (SECURITY DEFINER, `search_path=public`, autorizzazione da `auth.uid()`)**
- `set_product_stock_unit(product, unit)`: verifica che l'utente sia amministratore, che non ci sia un inventario in corso (`inventory_sessions` in corso) e che la U.M. appartenga all'azienda. Salva `stock_unit_id` e `stock_base_at = now()`, segna le confezioni «da rivedere» e scrive nel registro attività. Non tocca conteggi, movimenti o rettifiche.
- `manage_product_stock_package(...)`: crea, modifica e attiva/disattiva le confezioni. Mai cancellazione.
- `set_supplier_unit_conversion(link_unit, mode, package, factor, indicative)`: salva modalità e conversione con tutte le validazioni.
- `product_unit_config_issues(company)`: restituisce prodotto e motivi, per il filtro e per la scheda.
- Servirà una piccola migrazione solo per il campo «da rivedere» sulle confezioni e per le nuove funzioni. Nessuna modifica a tabelle storiche.

**Validazioni (nel database)**
- Modalità «stessa» solo con U.M. uguali.
- Modalità «fissa» con fattore maggiore di 0 o confezione attiva della stessa azienda e dello stesso prodotto.
- Modalità «variabile»: valore indicativo maggiore di 0 o vuoto; mai usato per la giacenza.
- Decimali secondo `allows_decimals` della U.M. di magazzino.
- Cambio U.M. di magazzino rifiutato se c'è un inventario in corso.
- Il trigger del Passo 1 (solo amministratori) resta attivo.

**Test**
- Test automatici sulle regole:
  - cambio rifiutato con inventario in corso;
  - cambio che aggiorna `stock_base_at`;
  - modalità «stessa» rifiutata con U.M. diverse;
  - modalità «fissa» senza fattore rifiutata;
  - confezione 2 × 6 = 12 bt;
  - utente operatore rifiutato.
- Controllo prima/dopo: conteggi, rettifiche, movimenti, righe ordine e carichi identici (stessi totali del Passo 1).
- Prova nel browser: assegnare «pz» a un prodotto di prova, vedere l'avviso, creare «Cassa 6 bt», collegarla a un fornitore e controllare che l'Inventario non sia cambiato.
- Ananas e Avocado vengono modificati solo con il tuo consenso esplicito.
