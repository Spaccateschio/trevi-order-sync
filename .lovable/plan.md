# Correzione quantità fisica nell’Inventario completato

## Obiettivo
Ripristinare la schermata esistente senza aggiungere nuovi riquadri: dopo l’ultimo inventario completato, la quantità salvata deve comparire direttamente nella cella **Quantità fisica** di ogni articolo.

## Modifica proposta
1. Eliminare il riquadro aggiunto **“Quantità fisica attuale”** sotto le schede, così le schede tornano compatte e risultano visibili più articoli.
2. Nella cella esistente **Quantità fisica**, mostrare subito l’ultima quantità fisica aggiornata, non un campo vuoto o un valore secondario.
3. Il comando generale **Sblocca quantità** abilita quelle stesse celle; la modifica viene salvata come rettifica tracciata senza cambiare il conteggio storico originale.
4. Dopo il salvataggio, la stessa cella mostra immediatamente il nuovo valore; modifiche successive partono sempre dall’ultimo valore salvato.
5. Non cambiare filtri, elenco prodotti, storico, ciclo semaforo, Lista della Spesa, Fabbisogno, database o funzioni server.

## File interessati
- `src/components/inventory/inventory-count-panel.tsx`: integrare visualizzazione e modifica nella cella esistente.
- `src/components/inventory/physical-quick-edit.tsx`: rimuovere il componente visivo aggiunto, dopo aver trasferito solo il comportamento necessario nella schermata esistente.

## Verifica senza dati reali
- Controllare che tutte le schede tornino all’altezza precedente.
- Controllare che ogni cella **Quantità fisica** mostri i valori salvati dell’ultimo inventario.
- Controllare che **Sblocca quantità** renda modificabili le celle.
- Non premere il salvataggio e non creare rettifiche o dati di prova.
