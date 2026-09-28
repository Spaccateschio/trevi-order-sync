# Rendere accessibile la correzione della giacenza

## Problema verificato
Nella finestra **Visualizza inventario**, alla larghezza mostrata, la tabella termina alla colonna U.M. e non presenta alcun comando di correzione. Il testo invita a usare “Correggi giacenza”, ma quel comando non è raggiungibile nella finestra.

## Modifica minima
1. In `inventory-count-panel.tsx`, rendere la correzione indipendente dal semaforo rosso: il semaforo governa il ciclo acquisti, non il diritto dell’amministratore a rettificare una giacenza errata.
2. Mantenere la protezione corretta: il conteggio chiuso resta immutabile e la correzione crea solo una rettifica tracciata.
3. In `inventory-session-counter.tsx`, mostrare sempre una colonna **Azioni** nello storico chiuso e rendere **Correggi giacenza** visibile per l’ultimo conteggio valido di ciascun prodotto; per conteggi superati mostrare una spiegazione chiara.
4. Non riaprire inventari, non modificare semaforo, Lista della Spesa, quantità o dati esistenti.

## Verifica
- Aprire **Visualizza inventario** alla stessa larghezza dello screenshot.
- Verificare che **Correggi giacenza** sia raggiungibile tramite scorrimento orizzontale.
- Aprire la finestra di rettifica senza salvarla.
- Verificare che i conteggi originali restino disabilitati e che il progetto compili correttamente.
