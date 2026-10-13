# Pagina Prodotti per attività dell'azienda — analisi e piano

Solo analisi. Nessuna modifica a codice, database, permessi, prodotti, U.M., listini o collegamenti B2B.

## Principio di base: capacità dell'azienda e permessi dell'utente

- **Capacità dell'azienda**: «acquista» (`can_buy`) e «vende» (`can_sell`). Le imposta l'amministratore in Amministrazione. Decidono **quali sezioni esistono** per quell'azienda.
- **Permessi dell'utente**: amministratore oppure operatore. Decidono **chi può modificare** dentro le sezioni che esistono.
- Le due cose si combinano. Se un'azienda non vende, nessuno vede le funzioni di vendita, nemmeno l'amministratore. Se l'azienda vende, l'operatore le vede in sola lettura.

## 1. Stato attuale (cosa fa oggi il programma)

| Punto | Oggi | Coerente? |
|---|---|---|
| Menu laterale | Le voci hanno una capacità «acquista»/«vende» e si nascondono se l'azienda non ce l'ha | Sì |
| Selettore Acquisti / Vendite nella tabella | Compare solo se l'azienda fa entrambe le cose | Sì |
| Colonne della tabella | Quelle iniziali dipendono dalla vista. Nel menu Colonne, però, «Altre colonne» mostra anche U.M. vendita, U.M. predefinita, listini e vetrina a chi compra soltanto | Parziale |
| Azioni sui prodotti selezionati | «In vetrina», «Nascondi» e «Gestisci U.M. vendita» compaiono anche a 3 EMME | No |
| Dettaglio prodotto | Ha sempre 4 schede: Prodotto, **Vendita**, Acquisto, Inventario, per tutte le aziende | **No** (il problema che hai visto) |
| Scheda Prodotto | Mostra lo «Stato Pubblicato/Non pubblicato», che riguarda la vendita | Parziale |
| Indirizzo /vendite/prodotti | Si apre anche per chi non vende, se qualcuno lo scrive a mano. La pagina non controlla la capacità | No |
| «Importa da Danea» | Nel database è riservato a chi vende (`company_sells`). Il pulsante però compare anche a chi compra soltanto, che riceve un errore | No |
| Database | Le scritture di vendita (vetrina, U.M. di vendita, listini) sono già protette da controlli dell'amministratore e dell'azienda | Sì, da non toccare |

**Nascondere e impedire non sono la stessa cosa.** Nascondere riguarda solo ciò che si vede sullo schermo. Impedire spetta al database, che lo fa già per le scritture. Il piano cambia solo ciò che si vede e non tocca nessuna regola del database.

## 2. Cosa vede ciascuna azienda (proposta)

| Elemento | Solo Acquisti (3 EMME) | Solo Vendite | Acquisti + Vendite (Trevi) |
|---|---|---|---|
| Selettore Acquisti / Vendite | No | No | Sì |
| Colonne di acquisto (U.M. magazzino, fornitori, U.M. d'acquisto, ★ fornitore, costo) | Sì | No | Nella vista Acquisti |
| Colonne di vendita (U.M. vendita, predefinita, listini, vetrina) | **No, nemmeno nel menu Colonne** | Sì | Nella vista Vendite |
| U.M. Danea | Nel menu Colonne, nascosta all'apertura | Sì | In tutte e due le viste |
| Filtro Fornitore | Sì | No | Nella vista Acquisti |
| Filtri di vendita (vetrina, disponibilità) | No | Sì | Nella vista Vendite |
| Azioni In vetrina / Nascondi / Gestisci U.M. vendita | No | Sì (amministratore) | Nella vista Vendite (amministratore) |
| Importa da Danea | No (il database lo rifiuta) | Sì (amministratore) | Sì (amministratore) |
| Scheda **Prodotto** | Sì, senza «Stato pubblicato» | Sì | Sì |
| Scheda **Vendita** | **No** | Sì | Sì |
| Scheda **Acquisto** | Sì | No | Sì |
| Scheda **Inventario** | Sì | Sì, solo giacenza in sola lettura se l'azienda non acquista | Sì |
| Indirizzo /vendite/prodotti | Rimanda ad /acquisti/prodotti | — | Sì |
| Indirizzo /acquisti/prodotti | — | Rimanda a /vendite/prodotti | Sì |

In ogni sezione visibile, l'**operatore** vede in sola lettura le parti di sola gestione, come accade già oggi.

Per **Trevi** le informazioni non si ripetono:
- la scheda Prodotto contiene i dati comuni;
- Vendita contiene solo vetrina, disponibilità, U.M. di vendita e listini;
- Acquisto contiene solo fornitori, U.M. d'acquisto, conversioni e costo;
- Inventario contiene solo U.M. di magazzino, giacenza e provenienze.

All'apertura il dettaglio mostra la scheda della vista da cui arrivi, come già oggi. Le preferenze di colonne e filtri restano separate per vista, come già fatto nella Parte B.

## 3. Piano a fasi (una alla volta, ognuna da approvare)

### Fase 1 — Schede del dettaglio prodotto
- **Oggi**: le schede Vendita e Acquisto sono sempre visibili.
- **Proposta**: la scheda Vendita compare solo se l'azienda vende, la scheda Acquisto solo se l'azienda acquista. Se la scheda iniziale richiesta non esiste, si apre «Prodotto». «Stato pubblicato» si vede solo per chi vende.
- **File**: `product-detail-sheet.tsx` e il passaggio delle capacità in `products-workspace.tsx`.
- **Rischio**: la finestra prodotto aperta dall'Inventario usa lo stesso dettaglio. Va verificato che apra sempre la scheda Inventario.
- **Test**: regola pura «quali schede per quali capacità», con 3 casi e la scheda iniziale di ripiego.

### Fase 2 — Colonne, filtri e azioni della tabella
- **Oggi**: le colonne e le azioni di vendita restano raggiungibili da chi compra soltanto.
- **Proposta**: ogni colonna e ogni azione riceve l'indicazione «acquisti», «vendite» o «comune». Si filtrano per capacità dell'azienda e poi per ruolo dell'utente. «Importa da Danea» compare solo se l'azienda vende.
- **File**: `product-grid.ts`, `products-view.ts`, `products-workspace.tsx`, `product-mobile-list.tsx`.
- **Rischio**: una preferenza salvata con colonne non più ammesse. Viene ignorata e non cancellata.
- **Test**: colonne ammesse per i 3 tipi di azienda; operatore e amministratore.

### Fase 3 — Indirizzi diretti
- **Oggi**: /vendite/prodotti si apre anche per chi non vende.
- **Proposta**: un rimando all'altra vista quando l'azienda non ha la capacità richiesta.
- **File**: le due pagine Prodotti.
- **Test**: regola del rimando.

### Fase 4 — Verifica a schermo
Controllo di 3 EMME e Trevi a 390 px e a 1280 px. Per entrare come Trevi ti chiederò l'approvazione.

## Cosa riusiamo, senza creare niente di nuovo
- Le capacità «acquista»/«vende» lette dall'utente collegato.
- Le funzioni del database `company_buys` e `company_sells`.
- `availableViews` e le colonne per vista della Parte B.
- I controlli dell'amministratore già presenti nel database.

Nessuna nuova tabella, funzione o permesso.

## Punti da decidere
1. Per un'azienda **solo Vendite**: la scheda Inventario va mostrata in sola lettura, come proposto, oppure nascosta?
2. Va bene il rimando automatico degli indirizzi diretti (Fase 3), invece di un messaggio «Sezione non disponibile»?
