# FASE C — Lista della Spesa + assegnazione fornitori (piano tecnico)

Tutto nasce dalle strutture già in casa: prodotti, archivi Danea, `product_supplier_links` (fornitori del prodotto), `product_supplier_costs` (costo Danea), `units_of_measure`, parametri di magazzino e inventario. Nessuna seconda anagrafica, nessun secondo calcolo del fabbisogno.

## 1. Tabelle

### `shopping_lists` — la lista
azienda, archivio Danea, nome, stato, note, autore, aperta il, confermata il, chiusa il, timestamp.

- Stati: **aperta** → **confermata** → **chiusa**; più **annullata**.
- Una sola lista *aperta* per azienda e archivio (regola operativa, come per l'inventario).
- Una lista confermata o chiusa non viene più riscritta: nessun nuovo inventario la modifica.

### `shopping_list_items` — la riga (snapshot della decisione)
lista, prodotto, U.M. della riga (`unit_id` + codice), **quantità suggerita dal sistema**, **quantità decisa dall'operatore**, origine del suggerimento (`manuale` / `fabbisogno`), motivo della modifica, stato della riga, note, autore, data/ora di inserimento e di ultima modifica.

Snapshot del momento dell'inserimento, mai aggiornato in automatico: disponibile, necessario, scorta minima, fabbisogno reale, multiplo applicato. Serve a rispondere a "perché quel giorno avevamo deciso 80".

- Stati riga: **da_assegnare** → **parziale** → **assegnata**.
- Unico (lista, prodotto) — vedi duplicati.

### `shopping_list_item_suppliers` — la ripartizione
riga, `product_supplier_link_id`, fornitore (`supplier_record_id` ridondato per lettura veloce), quantità assegnata nell'U.M. della riga, eventuale quantità nell'U.M. d'acquisto del fornitore, conversione usata, avviso sotto minimo accettato (sì/no), note, autore, timestamp.

- Unico (riga, fornitore): un fornitore compare una volta per riga.
- Le **percentuali non si salvano**: si calcolano dalle quantità al momento della visualizzazione.
- Vincolo di coerenza: il fornitore deve appartenere alla stessa azienda e il collegamento prodotto↔fornitore deve essere attivo e riferito a quel prodotto.

Accessi come le altre tabelle: lettura ai membri dell'azienda, scritture solo tramite funzioni protette lato server; operazioni importanti nel registro eventi.

## 2. Funzioni protette (RPC)

| Funzione | Cosa fa |
| --- | --- |
| `manage_shopping_list` | apre, rinomina, conferma, chiude, annulla una lista |
| `add_shopping_list_items` | aggiunge **uno o più prodotti in una volta** (dal Fabbisogno o a mano), scrivendo suggerito + snapshot; gestisce i duplicati |
| `set_shopping_list_item_quantity` | cambia la quantità decisa e l'eventuale motivo; il suggerito non si tocca mai |
| `assign_shopping_list_supplier` | assegna / modifica / rimuove la quantità di un fornitore su una riga, ricalcola lo stato della riga |
| `remove_shopping_list_item` | rimuove una riga da una lista ancora aperta |
| `shopping_list_overview` | righe con assegnati, residuo, stato, fornitori disponibili, costi, conversioni e **suggerimento attuale** ricalcolato per confronto |

Il fabbisogno continua a venire da `inventory_requirements`: un solo punto di calcolo, già esistente.

## 3. Residuo e stati della riga

Sempre visibili: **da acquistare** (quantità decisa), **assegnati** (somma), **residuo**.

- assegnati = 0 → *da assegnare*
- 0 < assegnati < decisa → *parziale*
- assegnati = decisa → *assegnata*
- assegnati > decisa → *parziale* con avviso in evidenza, per esempio "110 su 100": il sistema segnala, non corregge.

**Mai una redistribuzione automatica**: se porti Rossi da 60 a 70, Bianchi resta 40. La correzione la fai tu.

Una riga può restare incompleta durante la lavorazione. La **conferma della lista** richiede che ogni riga sia *assegnata*: le righe incoerenti vengono elencate e la conferma si blocca finché non sono sistemate.

## 4. Fornitori mostrati sulla riga

Letti solo da `product_supplier_links` (più `product_supplier_costs` per il costo Danea): preferito, costo Danea con data, costo Trevi Fruit con data, U.M. d'acquisto, conversione, quantità minima ordinabile, giorni di consegna, attivo, e se il fornitore è anche collegato in Trevi Fruit.

Il **preferito viene proposto** (evidenziato, primo in elenco, precompilato se assegni tutto a uno solo) ma **mai imposto**. Nessuna regola decide quale costo "vale": Danea e Trevi Fruit restano affiancati, come stabilito.

## 5. U.M. e conversioni (approvato con correzioni)

La riga vive nell'U.M. del prodotto (U.M. di magazzino se impostata, altrimenti U.M. Danea). Ogni assegnazione tiene **tre quantità sempre distinte**:

1. quantità assegnata nell'U.M. della Lista Spesa (per esempio 62 kg);
2. quantità effettiva nell'U.M. d'acquisto del fornitore, confermata dall'operatore (per esempio 5 casse);
3. equivalente risultante nell'U.M. della lista (5 × 15 = 75 kg) con l'eccedenza evidenziata (+13 kg).

**Nessun arrotondamento automatico.** Con 62 kg e casse da 15 kg il sistema mostra "62 kg ≈ 4,13 casse · in confezioni intere 5 casse ≈ 75 kg (+13 kg)" come **proposta**: la quantità decisa resta 62 kg finché non confermi tu le casse. Lo storico conserva sempre entrambi i numeri: quello che ci serviva e quello che compriamo davvero.

**Conversione mancante.** Se l'U.M. della lista e l'U.M. d'acquisto del fornitore sono diverse e non esiste una conversione esplicita, nessuna stima viene inventata: puoi preparare l'assegnazione, ma la riga **non può risultare assegnata né confermata** finché non imposti la conversione o scegli un fornitore/U.M. compatibile. Se le due U.M. coincidono non serve nessuna conversione.

## 6. Quantità minima del fornitore (approvato)

Non è la scorta minima: è il minimo ordinabile da quel fornitore, e non cambia mai il fabbisogno del prodotto.

**Avviso superabile, non blocco.** Se assegni 10 kg a Rossi che ha minimo 20 kg il sistema segnala "sotto il minimo di Rossi (20 kg)" e ti lascia proseguire, registrando sull'assegnazione che l'avviso è stato accettato, da chi e quando.

## 7. Duplicati

**Proposta: nessuna riga doppia.** Se aggiungi alla lista aperta un prodotto già presente:

- dal Fabbisogno con selezione multipla: i prodotti già presenti vengono **saltati** e contati nel riepilogo ("18 aggiunti, 2 già in lista"), senza toccare le decisioni già prese;
- dall'aggiunta singola: compare la scelta esplicita **"È già in lista: vai alla riga"** oppure **"Sostituisci la quantità suggerita con quella attuale"**, e in questo secondo caso la quantità decisa resta tua e il cambiamento viene tracciato.

Nessuna riga separata per lo stesso prodotto nella stessa lista: il caso "due decisioni distinte per lo stesso prodotto" si gestisce con due fornitori sulla stessa riga.

## 8. Suggerimento che cambia nel tempo

La riga conserva il suggerito del momento dell'inserimento. `shopping_list_overview` ricalcola il **suggerimento attuale** e la schermata mostra, solo quando differisce: "suggerito all'inserimento 60 · oggi 45". Nessun valore viene sovrascritto in automatico; puoi allineare la riga con un'azione esplicita.

## 9. Schermate

- **Fabbisogno** (già esistente): caselle di selezione, contatore dei selezionati e pulsante **Aggiungi alla Lista della Spesa** per l'intera selezione, anche 20 prodotti insieme.
- **Lista della Spesa** — computer e tablet: griglia compatta con codice, descrizione, U.M., suggerito, deciso (modificabile in linea), assegnati, residuo, fornitori assegnati, stato; ricerca rapida; filtri "da assegnare / parziali / complete / per fornitore / per archivio"; riga espandibile con la ripartizione fornitori.
- **Lista della Spesa** — telefono: schede touch con quantità grande, residuo in evidenza e assegnazione fornitori a pieno schermo.
- **Ripartizione**: elenco fornitori del prodotto con preferito evidenziato, campo quantità per fornitore, percentuali calcolate, totale assegnato, residuo, avvisi (sotto minimo, conversione mancante, somma oltre la quantità decisa).

## 10. Test previsti

Riga creata a mano; riga creata dal Fabbisogno con suggerito e snapshot corretti; selezione multipla di più prodotti; prodotto già in lista non duplicato; quantità decisa diversa dal suggerito con suggerito conservato; inventario modificato dopo l'inserimento che non cambia la riga e mostra il confronto; assegnazione a un solo fornitore; ripartizione su due fornitori con percentuali coerenti; modifica di un fornitore che non altera l'altro; somma superiore alla quantità decisa segnalata; residuo calcolato; stati da assegnare / parziale / assegnata; avviso sotto il minimo del fornitore; conversione presente che mostra la doppia lettura; conversione assente segnalata senza stime; conferma della lista bloccata con righe incoerenti e riuscita quando sono coerenti; lista confermata non modificata da un nuovo inventario. Nessun dato di prova lasciato nel database.

## 11. Fuori scope in questa fase

Ordine al fornitore, invio B2B, notifiche, motore predittivo, automazioni di acquisto.

## Due decisioni che aspettano la tua conferma

1. Quantità minima del fornitore: **avviso superabile** (proposta) oppure blocco.
2. Duplicati: **nessuna riga doppia** con salto nella selezione multipla e scelta esplicita nell'aggiunta singola (proposta).
