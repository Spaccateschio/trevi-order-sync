# Collegamenti B2B — riorganizzazione della pagina (solo grafica e uso)

Nessuna modifica a database, relazioni, inviti, codici, registrazione, clienti, prodotti, Danea, listini, indirizzi, destinazioni, permessi o funzioni sul server. Cambia soltanto come la pagina è disposta e come si usa.

## Come diventa la pagina

Titolo: **Collegamenti B2B**.

Sotto il titolo una barra compatta con quattro voci:

```text
Le mie connessioni | Cerca azienda | Invita partner | Ho un codice
   (vista)             (vista)         (finestra)      (finestra)
```

All'apertura si vede solo **Le mie connessioni**. Ricerca aziende, invito e inviti in attesa non stanno più tutti insieme nella stessa schermata.

Accanto alla barra due indicatori compatti che si aprono solo se li tocchi:

- **Richieste (N)** — richieste ricevute da approvare e richieste che hai inviato
- **Inviti (N)** — inviti e codici già generati, con rinnovo, annullamento, copia codice e stato "scaduto"

## Le mie connessioni

Un solo elenco compatto, in stile gestionale.

```text
Azienda            Rapporto        Stato    Mio lato   Azioni
3 EMME ROMA SRL    Io vendo a      Attivo   Attivo     Apri
QUIRINO FOOD SRL   Io compro da    Attivo   Attivo     Apri
BAR CENTRALE SRL   Entrambi        Sospeso  Spento     Apri
```

- **Rapporto** in parole chiare: *Io vendo a*, *Io compro da*, *Entrambi* (quando con la stessa azienda esistono i due rapporti incrociati). Non uso Cliente/Fornitore come concetto principale, perché l'anagrafica commerciale resta in Vendite → Clienti.
- Sopra l'elenco: campo **Cerca…** e filtri **Tutti | Io vendo | Io compro | In attesa | Sospesi**.
- Ogni riga ha una sola azione: apre il dettaglio. Nessuna fila di pulsanti su ogni riga.

## Dettaglio del rapporto

Si apre toccando la riga (pannello laterale su desktop, a tutta larghezza su smartphone) e mostra: ragione sociale, partita IVA quando è visibile alla tua azienda, rapporto, stato, il tuo lato, il lato del partner, come è nato il collegamento, le date utili (richiesta, accettazione, decisione) e l'eventuale cliente d'anagrafica collegato, con rimando alla sua scheda.

Le azioni stanno qui: **sospendi/riattiva il mio lato**, **chiudi collegamento** (con conferma), e per le richieste in attesa **accetta/rifiuta**. Sono le stesse operazioni di oggi, solo spostate.

## Cerca azienda

Vista separata: campo di ricerca per ragione sociale o partita IVA, scelta fra **Voglio vendere a questa azienda** e **Voglio comprare da questa azienda**, poi **Richiedi collegamento** sul risultato scelto.

## Invita partner

Finestra dedicata con **Invito rapido** (codice + link, email facoltativa, scadenza) e, dove già previsto, l'invito che parte da un cliente d'anagrafica. Restano codice, link, scadenza e campi facoltativi come sono adesso.

## Ho un codice

Finestra minima: un campo **Codice invito** e il pulsante **Continua**.

## Desktop e smartphone

- Desktop e tablet: tabella compatta con intestazioni, righe basse, colonne allineate.
- Smartphone: una card per collegamento con nome, rapporto e stato; il dettaglio si apre a tutta pagina.

## Dettagli tecnici

- Riscrivo solo `src/routes/_authenticated/collegamenti.tsx`, che diventa il contenitore delle tre viste (connessioni, ricerca, richieste/inviti) più le due finestre.
- Nuovi file di sola presentazione: `src/components/companies/connections-table.tsx` (elenco desktop + lista mobile) e `src/components/companies/connection-detail.tsx` (pannello dettaglio con le azioni).
- `relation-card.tsx` resta invariato e continua a servire l'elenco delle richieste; le sue azioni vengono riusate dal dettaglio.
- Nessuna nuova query o RPC: uso esattamente quelle attuali (`identity`/`relations`, `search_companies`, `invite_customer_relation`, `request_supplier_relation`, `create_free_invitation`, `accept_invitation_code`, `resend_customer_invitation`, `cancel_customer_invitation`, `set_relation_side_enabled`, `revoke_company_relation`, `decide_company_relation`).
- Colori e spaziature solo dai token del tema esistenti; nessun colore fisso.
- Verifica finale: controllo del codice, build e prova nel browser a 1280 px e 390 px.
