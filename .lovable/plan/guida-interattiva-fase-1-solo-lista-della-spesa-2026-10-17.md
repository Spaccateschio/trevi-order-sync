# Guida interattiva — Fase 1 (solo Lista della Spesa)

Nessuna modifica al database, nessuna pubblicazione. Ci si ferma dopo la Fase 1.

## Cosa vedrai
- Icona ⓘ accanto al titolo, solo nelle pagine che hanno una guida (per ora la Lista della Spesa).
- Premendola: «Guida completa» oppure «Chiudi» («Mostra le novità» arriverà nella Fase 2).
- Durante la guida: sfondo scuro, un elemento evidenziato alla volta, testo semplice, Avanti / Indietro / Salta / Fine, «Passo 3 di 9».
- La guida non può premere nulla: i clic sull'elemento evidenziato sono bloccati.
- I passaggi il cui elemento non c'è (per esempio lista chiusa o nessun prodotto) vengono saltati senza bloccare il tour.

## I nove passaggi della Lista della Spesa
| # | Identificativo | Elemento |
|---|---|---|
| 1 | spesa.titolo | Titolo e descrizione |
| 2 | spesa.banner-ordini | Banner ordini inviati (se presente) |
| 3 | spesa.ricerca | Campo di ricerca |
| 4 | spesa.preferiti | Filtro ★ Preferiti |
| 5 | spesa.filtri | Filtri Prodotto / stati |
| 6 | spesa.contatori | Contatori |
| 7 | spesa.aggiungi | «Aggiungi prodotti» |
| 8 | spesa.card | Prima card prodotto |
| 9 | spesa.genera | Barra fissa «Genera ordini» (solo spiegata) |

## Preparazione per la Fase 2 (solo struttura, non attiva)
Ogni guida ha versione e ogni passaggio ha identificativo stabile e «versione di introduzione». Così in Fase 2 si potranno mostrare solo le novità, riprendere un tour interrotto e proporre automaticamente all'ingresso «Vuoi scoprire cosa è cambiato?» in modo discreto, facoltativo e non ripetitivo.

## File toccati
- Installazione della libreria Driver.js.
- Nuovi: `src/lib/guides/` (definizioni guide versionate + logica di selezione passaggi, con test), `src/components/guide/` (icona ⓘ, menu, avvio tour caricato solo all'apertura).
- `src/components/app-shell.tsx`: solo aggiunta dell'icona ⓘ accanto al titolo e `data-tour` sul titolo.
- `src/routes/_authenticated/acquisti.lista-spesa.tsx`: indica la guida della pagina.
- `src/components/shopping/shopping-list-panel.tsx` e `src/components/purchase/sent-orders-banner.tsx`: solo attributi `data-tour`, nessuna logica cambiata.
- `src/styles.css`: aspetto del riquadro guida con i colori del tema.

## Verifiche
- Test automatici: ogni passaggio ha identificativo unico, versioni coerenti, i passaggi assenti vengono saltati.
- Anteprima (3 EMME, sola lettura) su computer e smartphone 390 px: i nove passaggi puntano agli elementi giusti, barra fissa inclusa, nessun pulsante operativo attivato, nessun dato modificato.
- Segnalerò i passaggi non verificabili (per esempio card assenti se la lista è vuota).
