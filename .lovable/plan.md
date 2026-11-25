# Arrivo merce con spunte (senza compilare)

## Cosa cambia per te
- Aprendo l'ordine da «Da ricevere", ogni prodotto ha una **spunta** accanto a codice, descrizione e quantità; in alto c'è **«Seleziona tutti»**.
- Le righe mostrano quello che ha **dichiarato il fornitore** (quantità e lotto). Se il fornitore non ha dichiarato nulla, si usa la quantità ordinata.
- Un solo pulsante colorato **«Conferma arrivo (N prodotti)»**: registra in automatico il carico merce dei prodotti spuntati. Niente pannello da compilare.
- Prezzo, lotto e quantità diversa restano possibili, ma dentro **«Correggi ▸»** sulla singola riga, chiuso di default (per i casi con problema).

## Chi compila lotti e quantità
- Il fornitore, dal suo link di consegna (già esistente: dichiarazione di consegna). Non cambia nulla per lui.

## Cosa non tocco
- Database e funzioni SQL, regole di giacenza e conversioni, Danea, storico, ordini non ancora inviati.

## Dettagli tecnici
- Al click: crea la ricevuta dalla consegna (comando esistente), salva le quantità verificate = dichiarate (`setGoodsReceiptItem`), poi `confirmGoodsReceipt`.
- Prodotti non spuntati: salvati con quantità verificata 0 nella stessa ricevuta (la conferma oggi vale per tutta la ricevuta). File: `purchase-order-detail.tsx`, `goods-receipt-panel.tsx`.
