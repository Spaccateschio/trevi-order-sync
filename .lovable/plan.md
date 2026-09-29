# Lista della Spesa — Step 1 (solo interfaccia)

## 1. File modificati (solo Lista della Spesa)
- `src/components/shopping/shopping-list-panel.tsx`: nuova vista a card, al posto dell'attuale tabella/card compatte, e parte superiore compatta.
- `src/components/shopping/use-shopping-list-extras.ts`: aggiunte solo letture (ultimo conteggio, U.M. dei fornitori collegati).
- Nuovo file `src/components/shopping/shopping-product-card.tsx`: copia grafica della card Inventario, con le funzioni della Lista.

Nessuna modifica a database, funzioni server, stati, Conferma, ordini, Inventario, Fabbisogno, Prodotti o Fornitori.

## 2. Inventario usato solo come riferimento (non toccato)
- `inventory-count-panel.tsx`: la card prodotto (bordi, raggi, font, immagine, stella, menu ⋮, pulsanti rapidi, griglia a 2 colonne) e la barra fissa di ricerca e filtri.
- Le classi grafiche vengono copiate; il codice dell'Inventario resta com'è.

## 3. Contenuto di ogni card
- Immagine, nome, codice, stella preferito (solo visualizzazione), menu ⋮ (Ripartisci fornitori, Rimuovi dalla lista: azioni che esistono già).
- **Ultimo conteggio: 5 kg · 28/09/2026**, in piccolo e in sola lettura. È l'ultimo conteggio confermato, letto come nell'Inventario. Se non c'è: «Mai contato».
- **Suggerita: 10 kg**, in piccolo, dal sistema.
- **Quantità da acquistare** (campo grande) + U.M. + `+1 +3 +5 +10 Azzera`.
- Riga fornitore (vedi punto 6) e stato: Da assegnare / Parziale / Assegnata.

## 4. +1/+3/+5/+10/Azzera con il salvataggio attuale
- Usano il salvataggio già esistente della quantità decisa: nessun cambio al server.
- I pulsanti sommano al valore mostrato. Il salvataggio parte dopo una breve pausa (circa 0,8 s) o uscendo dal campo, come nell'Inventario. Il campo si può anche scrivere a mano.
- **Limite attuale**: il database accetta solo quantità maggiori di 0. «Azzera» svuota il campo ma **non salva**: resta l'ultimo valore salvato e compare l'avviso «Inserisci una quantità maggiore di 0, oppure rimuovi il prodotto». Salvare lo zero o il vuoto arriverà con lo step «quantità vuota».

## 5. U.M. di acquisto senza cambiare la logica fornitori
Oggi la quantità decisa è sempre nell'U.M. del prodotto (es. kg). L'U.M. di acquisto (es. cassetta) si salva solo **sulla ripartizione di un fornitore**, tramite la stessa funzione della finestra Ripartizione. Quindi:
- Il selettore mostra **solo** l'unione delle U.M. abilitate negli articoli fornitore collegati (kg / cassetta / sacco). Nessuna U.M. libera.
- **1 fornitore assegnato**: la scelta si salva subito su quell'assegnazione, con lo stesso salvataggio della finestra Ripartizione (U.M. → articolo di quel fornitore). Se quel fornitore non vende quell'U.M., l'opzione appare disattivata con il nome dei fornitori che la vendono.
- **Nessun fornitore o più fornitori**: scegliere l'U.M. apre la finestra Ripartizione già esistente, perché lì si decide fornitore e U.M. Non invento un salvataggio nuovo.
- La quantità grande resta nell'U.M. del prodotto. Sotto compare la lettura della conversione già calcolata, per esempio «≈ 3 cassette da Rossi».

## 6. Fornitori nella card
- 1 assegnato: **Fornitore: Rossi Ortofrutta**.
- Più assegnati: **Ripartito: Rossi 60% · Bianchi 40%** (percentuali solo lette).
- Nessuno assegnato ma collegati: **2 fornitori disponibili**.
- Nessun collegamento: **Nessun fornitore associato**, in grigio, senza bloccare la card.
- Cliccando la riga si apre la finestra Ripartizione esistente, invariata.

## 7. Tre quantità ben separate
Tre righe con etichette e peso diversi:
- Inventario: piccolo, grigio, con data.
- Suggerita: piccola, con icona.
- Da acquistare: unico campo modificabile, grande.
Non vengono mai copiate l'una nell'altra.

## 8. Parte superiore, ricerca, filtri e barra fissa
- Titolo «Lista della Spesa», riferimento all'inventario d'origine (se presente) su una sola riga, poi subito ricerca + filtri già esistenti (Categoria, Fornitore, Altri filtri, Ordina) + «+ Aggiungi prodotti» (finestra attuale) e le card.
- Barra fissa: stesso principio dell'Inventario, con un codice separato nella Lista. Quando la ricerca esce dallo schermo compare una barra compatta sotto l'intestazione, calcolata sull'altezza reale.
- Filtri e ordinamenti restano solo visivi, come ora.
- Mobile: una card per riga. Desktop/tablet alla tua larghezza: due per riga.

## Escluso da questo step
Quantità vuota, «Fornitore da definire», regole di Conferma, avviso prodotti incompleti, creazione prodotto, modifica fornitori, riepilogo, stampa, invii.

## Verifica
Anteprima alla tua larghezza e da telefono, solo in lettura. Nessun salvataggio su dati reali: i pulsanti vengono verificati senza confermare.
