# Conteggio: immagini del fornitore e preferiti corretti

## Cosa correggo

1. **Immagini nel conteggio aperto**
   - Richiedo le immagini per tutti i prodotti mostrati, anche quando il prodotto di 3 EMME non possiede una foto propria.
   - Se manca la foto propria, viene mostrata quella della referenza collegata di trevi.
   - La foto propria, quando presente, continua ad avere la precedenza.
   - Nei dati attuali solo **BASILICO 0246** ha una foto caricata da trevi: quella dovrà comparire; gli altri prodotti continueranno a mostrare il segnaposto finché il fornitore non carica una foto.

2. **Stelle uguali ai preferiti del catalogo**
   - Le stelle nel Conteggio leggeranno i preferiti del catalogo di 3 EMME, collegando ogni prodotto cliente alla relativa referenza di trevi.
   - I sei articoli già scelti nel catalogo risulteranno quindi con la stella attiva.
   - Premendo la stella nel Conteggio si aggiornerà lo stesso preferito del catalogo, senza cancellare il prodotto già acquisito né il suo storico.

3. **Filtri corretti**
   - **Tutti** mostrerà sempre preferiti e non preferiti insieme.
   - **Preferiti** mostrerà soltanto i prodotti con la stella attiva nel catalogo.
   - L'apertura della pagina resterà su **Tutti**.

## File interessati

- `src/components/inventory/inventory-count-panel.tsx`
- `src/lib/inventory-count.functions.ts`
- `src/lib/product-images.functions.ts` solo se la verifica finale richiede un piccolo aggiustamento al collegamento già introdotto.

## Verifica

- Controllo con un conteggio aperto che il Basilico 0246 mostri la foto di trevi.
- Controllo che i sei prodotti acquisiti risultino stellati.
- Controllo che **Tutti** includa sia preferiti sia non preferiti e che **Preferiti** restringa correttamente l'elenco.
- Nessuna modifica a Fabbisogno, formule, ordini, lista della spesa o database.
