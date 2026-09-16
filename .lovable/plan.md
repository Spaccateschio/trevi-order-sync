# Correzione: due archivi Danea diversi sullo stesso catalogo

## Cos'è successo davvero

Hai inviato a Trevi Fruit un **secondo archivio Danea diverso** (Studio Rossi esempio 2, 14 prodotti) verso la stessa azienda che già contiene gli 81 prodotti del primo archivio.

Danea assegna gli identificativi interni dei prodotti separatamente in ogni archivio: lo stesso identificativo viene riutilizzato per un prodotto completamente diverso. Trevi Fruit ha quindi trovato due prodotti diversi che dichiarano di essere lo stesso prodotto e si è fermato con un errore tecnico, mostrato da Danea nella finestra rossa.

Non è un problema di credenziali, indirizzo o postazione: la comunicazione ha funzionato.

## Come lo correggo

1. **Nessun blocco totale dell'invio.** Quando un prodotto in arrivo dichiara un identificativo interno già appartenente a un altro prodotto dell'azienda, quel singolo prodotto viene **saltato** e registrato come segnalazione chiara nella diagnostica ("identificativo Danea già usato da un altro prodotto: probabile archivio Danea diverso"). Tutti gli altri prodotti dell'invio vengono importati normalmente.
2. **Stessa protezione sugli identificativi doppi dentro lo stesso file**: il secondo prodotto con lo stesso identificativo viene saltato con segnalazione, invece di far fallire l'intero invio.
3. **La protezione sull'invio completo resta valida**: con segnalazioni presenti, la depubblicazione in massa per assenza non viene eseguita.
4. **Risposta a Danea**: resta esattamente `OK` quando l'invio viene elaborato; nessuna finestra rossa per le semplici segnalazioni.

## Cosa NON cambio

Autenticazione, postazioni, password, indirizzo fisso, logica FULL/INCREMENTAL, prezzi, costi fornitore, pagina Prodotti.

## Nota importante per te

Due archivi Danea diversi **non devono** alimentare la stessa azienda su Trevi Fruit: i cataloghi si sovrapporrebbero. Se sono due attività distinte, servono due aziende separate su Trevi Fruit, ognuna con le sue postazioni. Le postazioni multiple sulla stessa azienda vanno bene solo quando contengono **lo stesso archivio**.

## Dettagli tecnici

- File toccato: `src/lib/danea-import.server.ts`.
- Prima di costruire le righe da salvare: risoluzione esplicita della riga bersaglio (`danea_internal_id` → `code`); se l'identificativo in arrivo appartiene a una riga diversa da quella bersaglio, il prodotto viene escluso da `rows` e finisce in `issues`.
- Deduplica degli identificativi interni all'interno del documento.
- Nessuna migrazione: il vincolo `products_company_internal_id_unique` resta invariato.

## Verifiche

- Reinvio del primo archivio (81 prodotti): idempotente, nessuna segnalazione.
- Invio del secondo archivio in conflitto: risposta `OK`, prodotti in conflitto saltati e segnalati nella diagnostica, catalogo esistente intatto.
- Prodotto senza conflitti nel secondo archivio: importato correttamente.
