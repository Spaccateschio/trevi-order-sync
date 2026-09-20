# Piano — Conteggio inventario visuale stile KDS

## Obiettivo
Trasformare esclusivamente il mockup frontend del Conteggio in una postazione operativa touch-first, mantenendo dati fittizi e stato React locale. Nessun collegamento o modifica a database, migration, RPC, formule o logiche reali.

## Esperienza da realizzare
1. **Avanzamento sempre visibile**
   - Intestazione “Inventario Magazzino Mandrione”.
   - Tabellone generale fisso con completati/totale, percentuale, barra evidente e prodotti ancora da controllare; il totale generale non cambia con zone, categorie, sottocategorie, preferiti o ricerca.
   - Avanzamento separato della selezione corrente, mostrato sotto il totale generale.
   - Riepilogo compatto: confermati senza differenze, con differenze, mancanti.
   - Aggiornamento immediato a ogni conferma e stato finale chiaramente completato.

2. **Navigazione visuale touch**
   - Barra permanente con cinque azioni grandi: Zone, Categorie, Sottocategorie, Prodotti, Cerca.
   - Pannelli visuali con pulsanti/card per zone, categorie e sottocategorie, ciascuno con avanzamento completati/totale; un click entra direttamente nel livello successivo.
   - Percorso cliccabile sempre visibile, per tornare rapidamente ai livelli precedenti.
   - Ricerca aperta dall’azione Cerca e indipendente dai filtri visuali.

3. **Flusso prodotti**
   - Dati mock realistici ampliati per simulare zone, categorie e sottocategorie.
   - Schede prodotto compatte con foto mock predisposta per la futura immagine associata, nome, codice, U.M., giacenza calcolata, quantità fisica modificabile, differenza e conferma con un tocco.
   - Informazioni disposte prevalentemente in orizzontale; più colonne su desktop e una scheda bassa per riga su smartphone.
   - Stati visivi distinti: da controllare, confermato invariato, confermato con differenza.
   - Filtri rapidi Preferiti/Tutti e Da controllare/Completati/Con differenze; apertura iniziale su Da controllare.
   - I prodotti confermati restano consultabili nei filtri appropriati.

4. **Completamento simulato**
   - Riepilogo “Inventario completato” al termine della selezione.
   - Totali senza differenze e con differenze.
   - Azione per vedere solo le differenze e conferma finale esclusivamente locale/simulata.

5. **Responsive e verifica**
   - Riduzione coordinata di font, altezze, spazi, margini e controlli senza perdere leggibilità o facilità touch.
   - Tabellone generale e barra di navigazione sensibilmente più bassi, mantenendo invariati contenuti e comportamento.
   - Layout ad alta densità per desktop/tablet e superfici cliccabili compatte su smartphone.
   - Verifica del percorso completo a 1280 px e 390 px: navigazione, breadcrumb, ricerca “pom”, modifica quantità, conferma, filtri e completamento.

## File previsti
- `src/lib/inventory-mock.ts`: soli dati fittizi aggiuntivi e metadati visuali.
- `src/components/inventory/mock-inventory-panel.tsx`: nuova esperienza KDS locale.
- `src/assets/inventory-mock/`: immagini prodotto esclusivamente mock usate nelle schede.
- `roadmap.md`: aggiornamento dell’attività mockup.

## Esclusioni confermate
Nessuna modifica a database, migration, RPC, funzioni server, formule inventario, logica reale o schermate operative già collegate ai dati reali.
