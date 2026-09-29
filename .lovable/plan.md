# Blocco e sblocco delle schede dell’ultimo inventario

## Comportamento visivo
- Quando l’ultimo inventario è completato e **Sblocca quantità** non è attivo, tutte le schede hanno uno sfondo giallo ocra e risultano chiaramente bloccate.
- Premendo **Sblocca quantità**, le schede tornano al colore operativo normale.
- Durante un inventario aperto o l’inserimento iniziale, le schede mantengono il colore operativo normale.

## Comandi nella scheda
Quando le schede sono bloccate:
- quantità, pulsanti `+1 / +3 / +5 / +10`, azzera e conferma sono disabilitati;
- i comandi che modificano dati sono disabilitati;
- restano accessibili solo le consultazioni, come lo storico del prodotto e l’apertura della scheda prodotto.

Quando si preme **Sblocca quantità**:
- quantità, incrementi, azzera e conferma diventano utilizzabili sulla quantità fisica attuale;
- preferito e proposta d’acquisto tornano utilizzabili perché non riscrivono il conteggio chiuso;
- storico e apertura prodotto restano disponibili.

## Protezione dello storico chiuso
I comandi **Segna da ricontare** e **Non conforme** non verranno attivati sul conteggio chiuso: oggi creano nuove righe dentro una sessione aperta e riattivarli qui violerebbe la regola già approvata che lo storico completato resta immutabile. Renderli disponibili richiederebbe un intervento separato sulla logica dati, non una correzione grafica.

## Ambito tecnico
- Modificare solo `src/components/inventory/inventory-count-panel.tsx` e, se necessario per coordinare i comandi della quantità, `src/components/inventory/physical-quick-edit.tsx`.
- Nessuna modifica al database, alle funzioni server, al semaforo, alla Lista della Spesa o al Fabbisogno.
- Nessun dato reale creato durante le prove.

## Verifica
- Controllare alla larghezza dello screenshot che tutte le schede chiuse siano ocra.
- Controllare che prima dello sblocco i comandi di modifica siano inattivi.
- Premere **Sblocca quantità** e verificare che quantità, incrementi, azzera, conferma, preferito e proposta siano attivi.
- Non cambiare valori e non eseguire salvataggi.
