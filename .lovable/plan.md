# Completamento interfaccia Catalogo (prima della Fase 2)

## Cosa cambia per l'utente
1. Riquadro «Collegamento da completare»: resta, e ogni articolo diventa un link che apre la sua scheda.
2. Etichetta «Collegamento da completare» su ogni card/riga del Catalogo, accanto alla stella. È visibile con qualsiasi filtro: la condizione dipende solo da stella + collegamento attivo, non dai filtri.
3. Nuova sezione «Articoli non più in catalogo» (sotto l'elenco): mostra i preferiti che il fornitore non pubblica più (oggi 1803 PATATE VIOLA EST FR e 1812 BASILICO IT CONF.100 GR), con la stella ancora attiva e l'indicazione «Non acquistabile finché non torna pubblicato». Non ci sono pulsanti per aggiungere ai prodotti, alla Lista o agli ordini. Togliere la stella resta possibile.

## Rischio da decidere prima (richiede il database)
Oggi il cliente **non può leggere** gli articoli non pubblicati: la regola di accesso ai prodotti del fornitore ammette solo `publish_status = 'pubblicato'` e `b2b_visible`. Per mostrare codice e descrizione dei 2 articoli serve una nuova funzione DB di **sola lettura**:
- `buyer_unpublished_favorites(_buyer_company_id)`: SECURITY DEFINER, search_path = public; verifica `is_company_member` dell'utente autenticato; restituisce solo id, codice, descrizione e fornitore degli articoli che hanno la **nostra stella** e che non sono più pubblicati/visibili; GRANT solo ad authenticated.
- Non espone prezzi, immagini né altri articoli non pubblicati.

L'alternativa senza database è mostrare «2 preferiti non più in catalogo» senza nome né codice. La sconsiglio perché non serve all'operatore.

Il blocco agli acquisti dipende già dal database: F e la Lista leggono solo articoli pubblicati, quindi l'interfaccia non deve aggiungere nessuna regola nuova.

## File da modificare
| File | Modifica |
|---|---|
| `src/components/catalog/catalog-list.tsx` | nuova prop facoltativa `linkPending?: Set<string>`; etichetta accanto alla stella nella vista tabella e nella vista card (righe ~147 e ~214). Nessun altro cambiamento: senza la prop l'aspetto resta quello di oggi |
| `src/routes/_authenticated/acquisti.catalogo.index.tsx` | link alla scheda nel riquadro; passa `linkPending` a CatalogList; nuova sezione «Articoli non più in catalogo» (lettura con la funzione sopra), con la stella che si può solo togliere |
| migrazione 0032 (solo se approvi) | `buyer_unpublished_favorites`, sola lettura |

Senza modifiche: scheda articolo (etichetta già presente), `$sellerId.index.tsx`, `catalog-favorites.ts`, Lista, Inventario, Ordini, F/E.

## Controlli contro le regressioni
- Typecheck pulito e build OK.
- Come 3 EMME, su computer (1280) e telefono (390):
  - riquadro con 3 link, ognuno apre la scheda giusta;
  - etichetta sulle card dei 3 articoli e su nessun'altra, con i filtri «Solo preferiti», per categoria, per fornitore e con la ricerca;
  - sezione con i 2 articoli, stella attiva, nessun pulsante di aggiunta.
- Le 13 card preferite già collegate non mostrano l'etichetta.
- Nessuna scrittura durante le prove: le richieste di modifica vengono bloccate nello script del browser e la stella non viene cliccata. Conteggi prima/dopo: 18 stelle, 21 collegamenti, prodotti invariati.
- Funzione DB: come 3 EMME restituisce esattamente 2 righe; come trevi srl (per 3 EMME) viene rifiutata; per un utente non membro, 0 righe o errore.
- Pagine Ordini, Ordini clienti e Prodotti del fornitore: si aprono senza errori.

## Verifica in sola lettura già eseguita: finestra ordine
- In Ordini (3 EMME) ci sono 2 pulsanti «Modifica»: uno è disattivato, l'altro (ORD-2026-00003) apre la finestra «Chiedi modifica», perché il fornitore ha già visto l'ordine. Si è aperta senza errori e l'ho chiusa con «Chiudi», senza scrivere né salvare nulla.
- Non c'è oggi un ordine in stato modificabile direttamente, quindi la finestra «Modifica ORD-…» con righe, consegna e note **non è verificabile** senza creare o cambiare un ordine.
