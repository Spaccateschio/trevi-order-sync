# Correzione immediata dello storico inventario

## Risultato atteso
- Nella pagina principale ogni prodotto mostra per intero **Ultimo conteggio: quantità + U.M. + data**, senza testo troncato.
- In **Visualizza inventario** la quantità realmente confermata appare come testo chiaro nella colonna **Contata**, non come campo disabilitato.
- Ogni riga conteggiata mostra un comando evidente **Modifica giacenza**, visibile senza dover cercare o scorrere fino all'ultima colonna.
- Su telefono lo stesso comando compare subito sotto quantità e stato.

## Comportamento della modifica
- **Modifica giacenza** apre la finestra già esistente con quantità originale, nuova quantità e motivo obbligatorio.
- Il conteggio del 28/09 resta immutato nello storico; viene registrata soltanto la rettifica tracciata già prevista.
- Il comando non dipenderà più dal fragile confronto grafico con “ultimo conteggio”; l'autorizzazione effettiva resta controllata dalla funzione esistente.

## Ambito tecnico
- Modificare solo `src/components/inventory/inventory-count-panel.tsx` e `src/components/inventory/inventory-session-counter.tsx`.
- Nessuna modifica a database, funzioni server, semaforo, Lista della Spesa, Fabbisogno o dati reali.
- Verifica alla larghezza mostrata nello screenshot e su telefono, aprendo la rettifica senza salvarla.
