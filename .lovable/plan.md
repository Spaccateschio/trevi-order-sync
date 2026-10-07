# Passo 2 — piano operativo: configurazione U.M. nella scheda prodotto

Serve solo a configurare i dati. Inventario, calcolo giacenza, Carico merce, Lista della Spesa, Ordini e sincronizzazione Danea **non cambiano**. I nuovi dati vengono salvati ma letti solo dal Passo 3 in poi.

## Vecchia «U.M. di riferimento» della scorta: resta visibile e funzionante
Verifica sul codice e sul database (nessuna modifica):
1. **Chi la usa oggi:**
   - `product_stock_overview` la mostra nella scheda;
   - `product_count_units` la aggiunge come opzione del vecchio selettore dell'Inventario;
   - `add_shopping_list_items` la usa come U.M. della riga quando aggiungi un prodotto alla Lista (se è vuota, usa la U.M. Danea).
2. **Scorta minima:** il numero si salva nella stessa tabella, ma nessun calcolo legge la U.M. insieme a esso.
3. **Multiplo di riordino:** come la scorta minima, la U.M. non viene letta.
4. **`inventory_requirements` (Fabbisogno):** legge scorta minima e multiplo, ma **non** la U.M. di riferimento.
5. **Lista della Spesa:** sì, tramite `add_shopping_list_items` (vedi punto 1).
6. **Dati attuali:** nessun prodotto ha impostazioni di scorta salvate (0 righe). Oggi il campo non influenza nulla, ma può farlo appena qualcuno lo compila.

Decisione nel Passo 2: il campo **resta visibile e modificabile**, separato dalla U.M. di magazzino, con la nota «Campo del sistema attuale — sarà sostituito dalla U.M. di magazzino nei prossimi passi». Nessun dato nascosto. Scorta e fabbisogno verranno migrati in un passo dedicato, con una scelta esplicita sul significato dei numeri: 10 kg non diventa 10 pz.

## Periodo fra Passo 2 e Passo 3
- Nella scheda, sotto la U.M. di magazzino, un avviso fisso: «La nuova U.M. di magazzino è configurata ma non è ancora utilizzata dall'Inventario. Diventerà operativa con il Passo 3.»
- Le prove si fanno solo su un prodotto di test. Ananas, Avocado e gli altri prodotti reali non vengono modificati prima del Passo 3, salvo tua richiesta esplicita.

## Confezioni «da rivedere» e fattori fornitore
- Una confezione «da rivedere» o disattivata non è utilizzabile né dal Carico né dal futuro conteggio misto finché non la riconfermi. Il blocco è nel database.
- Le conversioni fornitore collegate a quella confezione finiscono in «Configurazione U.M. da completare».
- **Fattore del fornitore** (es. 1 cassa = 6 bt) = serve solo alla conversione dell'acquisto.
- **Confezione dichiarata** = serve anche al conteggio misto.
- Un fattore del fornitore non diventa mai automaticamente una confezione e non compare nell'Inventario.

## Conversioni riferite a una U.M. di magazzino precedente
Soluzione proposta: ogni conversione corrente dichiara per quale U.M. di magazzino è stata verificata.
- Nuovo campo `verified_stock_unit_id` sulle U.M. d'acquisto per fornitore e sulle confezioni. Si compila al salvataggio con la U.M. di magazzino di quel momento.
- Una conversione (fattore diretto, confezione collegata o valore indicativo) è **valida solo se** `verified_stock_unit_id = products.stock_unit_id` attuale.
- Al cambio di U.M. di magazzino nulla viene cancellato o riscritto: la conversione diventa automaticamente «da rivedere» perché non corrisponde più. Il vecchio valore resta visibile come informazione («Era: 1 cassa = 6 bt, verificata per bt»).
- Il database impedisce l'uso di una conversione non valida. Una funzione unica, `effective_supplier_conversion`, restituisce «nessuna conversione» quando la verifica non corrisponde. Carico, Lista e conteggio misto (passi successivi) dovranno leggere solo questa funzione, e un controllo sui nuovi documenti rifiuta conversioni non valide.
- La riconferma si fa nella scheda («Conferma per pz»), con valore nuovo o uguale scelto esplicitamente.
- Per le conversioni esistenti senza verifica il campo resta vuoto, quindi risultano «da configurare»: nessuna validità presunta.

Regole confermate:
- Fissa con confezione: il fattore è **sempre** la quantità della confezione; non si inserisce un fattore separato.
- Se modifichi la quantità di una confezione, le conversioni collegate diventano «da riconfermare» (una data di versione della confezione più recente della verifica). Mai aggiornate in silenzio.
- Una confezione «da rivedere» o disattivata non può essere scelta in nuove configurazioni né usata in nuovi documenti.
- Un fattore diretto del fornitore non crea mai una confezione.
- Storico: l'invalidazione riguarda solo la configurazione corrente. Ordini, carichi e movimenti conservano la loro fotografia e non vengono toccati.

Nuovi motivi in «Configurazione U.M. da completare»:
- conversione fornitore verificata per una U.M. di magazzino diversa da quella attuale;
- conversione collegata a una confezione modificata dopo la verifica.

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
- `product-stock-panel.tsx`: U.M. di magazzino con avviso «non ancora operativa», confezioni e vecchio campo scorta mantenuto con nota.
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
- Ananas e Avocado non vengono toccati prima del Passo 3.
- Test: conversione con U.M. verificata diversa = non valida; modifica di una confezione = conversioni da riconfermare; confezione «da rivedere» rifiutata; fattore fornitore senza confezione non crea confezioni.
