# Inventario: più spazio ai prodotti

## Modifiche proposte
1. **Un solo riepilogo**: integrare «Inventario in corso» in «Inventario generale», mantenendo nome/data, avanzamento e contatori. Anche gli altri stati del ciclo e le loro azioni restano visibili nello stesso riepilogo, senza cambiare il loro significato.
2. **Niente riga dedicata alla stampa**: spostare «Stampa giacenze» accanto a «Filtri» e «Colonne». Conservare gli altri comandi di modifica/sblocco con le condizioni attuali.
3. **Barra principale compatta**: «★ Preferiti», «Tutti», «Azzera quantità», «Tutti gli stati» e un menu «Altri stati» con Da controllare, Confermati, Differenze, U.M. diverse e Da ricontare. Il filtro selezionato sarà riconoscibile anche a menu chiuso.
4. **Comandi vicini**: Filtri, Colonne e Stampa nello stesso gruppo degli stati. «Da ricordare» viene interpretato come l'attuale «Da ricontare»: resta accessibile dal menu, senza rinominarlo. Sugli schermi stretti i comandi occupano due righe ordinate, senza tagliare testi o icone.
5. **Eliminare i doppioni**: togliere il blocco «Tutto l'inventario» con le descrizioni e i contatori già presenti nel riepilogo generale. Quando si sceglie una categoria o una zona, conservarne nome e avanzamento in una breve indicazione. Togliere il testo esplicativo sotto Filtri/Colonne; nessuna regola o informazione dei prodotti cambia.
6. Adeguare anche la barra compatta che compare durante lo scorrimento, evitando di riproporre tutti gli stati in fila.

## Ambito e salvaguardie
- Solo disposizione e presentazione nella pagina Inventario.
- Banner ordini, card prodotto, quantità, permessi, semaforo, Lista della Spesa, Fabbisogno, Zone e database invariati.
- «Azzera quantità» mantiene il comportamento e le conferme attuali: non si unificano le diverse operazioni di azzeramento.

## File autorizzati
- `src/components/inventory/inventory-count-panel.tsx`: riepilogo e barre dei comandi, mantenendo le funzioni esistenti.
- `roadmap.md`: aggiornamento della sola attività relativa a questa compattazione.

Non sono previste modifiche a stili globali, altre pagine o funzioni del database.

## Verifica
- Confronto a schermo della parte alta prima/dopo: i prodotti devono iniziare più in alto.
- Controllo su computer e smartphone: tutti i comandi accessibili, nessun testo sovrapposto.
- Apertura dei menu stati, Filtri e Colonne; verifica della selezione e della stampa.
- Controllo degli stati inventario in corso/completato senza cambiare dati reali.
- Riepilogo finale con esito, file toccati e numero di righe modificate.