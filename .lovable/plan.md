# Spostare le colonne nell'elenco Clienti

## Cosa cambia per te
- Trascini l'intestazione di una colonna e la rilasci dove vuoi: la colonna si sposta in quella posizione.
- L'ordine scelto resta salvato sul tuo dispositivo, anche dopo aver chiuso la pagina.
- L'ordine vale anche per stampa, Excel e CSV dei clienti selezionati.
- La colonna "Denominazione" resta sempre presente, ma può essere spostata anche lei.
- Il ridimensionamento delle colonne, la ricerca e la selezione multipla restano come sono adesso.
- Su smartphone nulla cambia (resta la lista a schede).

## Dettagli tecnici
- `src/lib/customer-columns.ts`: le chiavi visibili diventano un ordine esplicito; aggiunta di una funzione per spostare una chiave in una nuova posizione e normalizzazione al caricamento (chiavi nuove/sconosciute gestite senza perdere le preferenze salvate).
- `src/components/companies/customer-records-panel.tsx`: le colonne della tabella si costruiscono seguendo l'ordine di `visibleColumns` invece dell'ordine fisso di `CUSTOMER_COLUMNS`; gli `<th>` diventano trascinabili (`draggable`, `onDragStart`, `onDragOver`, `onDrop`) con evidenziazione del punto di rilascio, senza interferire con l'ordinamento al clic né con la maniglia di resize.
- Nessuna modifica al database, alle RPC o alla logica clienti.
