# Lista della Spesa: filtri ordinati sul cellulare

## Sistemazione proposta
- Ricerca prodotto su una riga dedicata, a tutta larghezza.
- Prima riga scorrevole orizzontalmente: Preferiti, Categoria, Fornitore, Filtra card e filtri attivi.
- Seconda riga scorrevole orizzontalmente: Aggiungi prodotti, Ordinamento, Visualizza dati, Stampa e Azzera filtri.
- Comandi senza ritorni a capo casuali; scorrimento confinato alle due righe, non all'intera pagina.
- Sul computer mantenere una disposizione adatta allo spazio disponibile.

## Cosa resta invariato
Tutti i filtri, i contatori e i comandi mantengono il comportamento attuale. Nessuna modifica a quantità, fornitori, Inventario, Genera ordini, database o dati reali. Nessuna pubblicazione.

## File previsti e dettagli tecnici
- `src/components/shopping/shopping-list-panel.tsx`: solo struttura e classi della barra operativa, usando i controlli shadcn/ui esistenti; gruppi con overflow orizzontale e controlli non comprimibili.
- `roadmap.md`: annotazione e completamento dell'intervento.
- Nessun altro file applicativo da modificare.

## Verifica
Controllo a 390 px e su computer: righe scorrevoli, nessuno sforamento della pagina, apertura dei menu e filtri funzionanti, contatori e barra inferiore conservati. Nessuna scrittura su dati operativi.
