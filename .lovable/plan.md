# Ripristino pagina Inventario (sticky + spazio), senza toccare le card

## Diagnosi (confronto con le versioni precedenti)

1. **La modifica delle card di oggi (06:18–06:19) non ha toccato il layout.** Ha cambiato solo la scheda prodotto (`ProductCard`, righe ~2581–2990 di `inventory-count-panel.tsx`) e `physical-quick-edit.tsx`. Intestazione, schede, semaforo, ricerca, filtri e barra fissa sono rimasti identici.

2. **Perché sparisce la barra fissa (ricerca + filtri)**
   - Il comportamento sticky c'è ancora (dal 27/09, non modificato): il riquadro «Nessun inventario in corso» resta fisso. Una barra compatta con ricerca e filtri compare dentro quel riquadro quando la ricerca originale esce dallo schermo.
   - Il meccanismo che fa comparire la barra usa una soglia fissa di **120 px** (righe 2185–2197).
   - Il 27/09 alle 17:08 è stato aggiunto il box «Ultimo inventario (chiuso) + Visualizza inventario» dentro il riquadro fisso. Senza un inventario in corso, il riquadro è diventato alto circa 190 px.
   - Risultato: la ricerca finisce **sotto** il riquadro fisso, ma per il sistema è ancora «visibile». Per questo la barra compatta non compare mai. Durante un inventario in corso il problema non si presenta.

3. **Cosa è cambiato sopra i prodotti**
   - L'unico blocco nuovo è la riga separata **«Sblocca quantità»** (righe 1313–1319), aggiunta stamattina alle 05:26 con il primo sblocco delle quantità.
   - Tutti gli altri blocchi (titolo, schede Conteggio/Fabbisogno/Zone, avviso del ciclo, riquadro inventario, ricerca, «Tutto l'inventario» con i filtri) esistevano già prima, nello stesso ordine.

## Ripristino proposto (solo 2 punti, file `inventory-count-panel.tsx`)

1. **Barra fissa**: la soglia fissa di 120 px viene sostituita dall'altezza reale del riquadro fisso, misurata sulla pagina. La barra compatta ricompare appena la ricerca viene coperta, come prima. Nessun cambio di posizione, stile o contenuto.
2. **Riga «Sblocca quantità»**: il pulsante viene spostato sulla riga già esistente delle schede, accanto a «Nuovo conteggio», e la riga dedicata viene eliminata. Si recupera così lo spazio di prima. Funzionamento e condizioni restano identici.

## Cosa NON viene toccato
Logica delle card (ocra, matita, sblocco, Conferma, rettifica), titolo, schede, semaforo, avviso del ciclo, ricerca, barra filtri, Lista della Spesa, Fabbisogno, storico, database.

## Verifica
Controllo nell'anteprima alla tua larghezza (833 px): scorrendo, ricerca e filtri restano visibili in alto; le schede prodotto funzionano come ora. Nessun dato salvato.
