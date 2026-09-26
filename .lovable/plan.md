# Conteggio: avviso quando confermi prodotti senza quantità

## Cosa cambia per te

Premendo **"Conferma visibili invariati"**, se uno o più prodotti visibili non hanno una quantità scritta, prima di salvare si apre una finestra:

> "Questi articoli non hanno una quantità inserita:"
> elenco con nome, codice e U.M. (scorrevole, adatto a smartphone)

Tre pulsanti:
1. **Riprendi e inserisci** — chiude la finestra, non salva niente, mostra solo quei prodotti (filtro "Da controllare") e porta il cursore sul primo campo.
2. **Conferma e vai alla Lista della Spesa** — conferma come invariati (quantità calcolata) e apre la scheda Fabbisogno, da cui si passa alla Lista della Spesa.
3. **Conferma solamente** — conferma come invariati e resti sul Conteggio.

Se tutti i prodotti visibili hanno una quantità scritta, la finestra non compare.

## Correzione collegata (da confermare)

Oggi questo pulsante salva sempre la quantità calcolata, anche dove hai già scritto un numero: per questo i tuoi valori sono diventati 0. Propongo che, dove hai scritto una quantità, venga salvata **quella** (con la stessa U.M. scelta e la stessa richiesta di nota se diversa dalla calcolata); la quantità calcolata solo per i prodotti lasciati vuoti.

## Dettagli tecnici

- Solo `src/components/inventory/inventory-count-panel.tsx`: `confirmAllUnchanged` divide i target in "con bozza" e "senza bozza"; se ci sono righe senza bozza apre un `AlertDialog` shadcn; le tre azioni chiamano `setWorkFilter("pending")` + focus, oppure la conferma seguita da cambio tab a "fabbisogno" o nessuna navigazione.
- Nessuna modifica a database, RPC, U.M., formule o Lista della Spesa. I conteggi a 0 già salvati restano nello storico; si correggono ricontando.
