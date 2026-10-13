# Collegamenti B2B: pagina Clienti e articoli del fornitore

Solo analisi e proposta. Nessuna modifica a dati, collegamenti, prodotti, U.M., listini o permessi.

## Verifica del collegamento 3 EMME ↔ Trevi (sola lettura)

- Il collegamento è **attivo**, con entrambi i lati accesi.
- Trevi è il fornitore, 3 EMME l'acquirente.
- È collegato sia alla scheda cliente di Trevi sia alla scheda fornitore di 3 EMME.
- Trevi ha **118 articoli in vetrina**.

Non è stato cancellato né nascosto nulla.

## Problema 1: «Cliente associato» e pagina Clienti

**Causa.** Nella finestra del collegamento, il riquadro «Cliente associato» compare ogni volta che il collegamento ha una scheda cliente. Il programma non controlla da quale lato si trova chi guarda.
- Quella scheda è di Trevi: è il modo in cui Trevi registra 3 EMME tra i suoi clienti. Il riferimento in sé è corretto.
- A 3 EMME, però, viene mostrato come se fosse suo, con il pulsante «Vai alla scheda» che porta alla pagina Clienti, cioè una pagina di vendita.
- È un errore di presentazione, non di dati.

**Menu.** La voce Clienti è già nascosta a chi non vende. Ci si arriva solo da questo pulsante, oppure scrivendo l'indirizzo a mano.

**Comportamento proposto**

| Azienda | Nella finestra del collegamento |
|---|---|
| Solo Acquisti (3 EMME) | Riquadro «Fornitore associato» → pulsante «Vai al fornitore» (Acquisti → Fornitori). Niente «Cliente associato», niente listino |
| Solo Vendite | «Cliente associato» → Clienti, con il «Listino assegnato», come oggi |
| Acquisti + Vendite (Trevi) | Il riquadro dipende dal ruolo nel collegamento: se Trevi è il fornitore vede «Cliente associato» e il listino; se è l'acquirente vede «Fornitore associato» |

In più, chi non vende e apre /vendite/clienti scrivendo l'indirizzo viene riportato alla Panoramica, invece di vedere il messaggio. È la stessa regola già usata nella pagina Prodotti.

## Problema 2: articoli del fornitore Trevi

**Causa.** Lo storico del codice mostra che la finestra del collegamento non ha mai avuto una scheda «Articoli». Ha sempre avuto solo Dettagli, Note e Cronologia, e le recenti modifiche alla pagina Prodotti non l'hanno toccata.
- Gli articoli sono in **Acquisti → Catalogo fornitori**, alla vetrina di Trevi. Lì 3 EMME vede gli articoli che può comprare, con le U.M. e i prezzi pubblicati da Trevi.
- La funzione esiste ed è raggiungibile dal menu.
- Manca però un **passaggio diretto dal collegamento** al catalogo, e per questo sembra sparita.

I prodotti propri di 3 EMME (pagina Prodotti) e il catalogo di Trevi (Catalogo fornitori) restano due cose separate.

**Comportamento proposto.** Quando chi guarda è l'acquirente e il collegamento è operativo, la finestra mostra in alto il pulsante **«Vedi articoli del fornitore»**. Il pulsante apre la vetrina di Trevi nel Catalogo fornitori, senza duplicare nulla. Se il collegamento è sospeso o in attesa, il pulsante non compare e una frase spiega il motivo.

## File da modificare

- `src/components/companies/connection-detail.tsx`:
  - il riquadro cambia in base al lato di chi guarda (Cliente associato / Fornitore associato);
  - nuovo pulsante «Vedi articoli del fornitore».
- `src/routes/_authenticated/vendite_.clienti.tsx`: rimando per chi non vende.
- Un piccolo test sulla regola «cosa mostrare per lato e capacità».
- `roadmap.md`.

## Rischi

- Trevi compra e vende: va verificato che, nei collegamenti in cui è fornitore, continui a vedere listino e cliente come oggi.
- Il collegamento in cui 3 EMME è acquirente ha anche una scheda fornitore sul lato di 3 EMME: il pulsante «Vai al fornitore» va mostrato solo quando questa scheda esiste.

## Verifiche

- Test sulla regola, controllo del codice e build.
- Controllo a schermo di 3 EMME a 390 e a 1280 px (ti chiederò l'approvazione per l'accesso) e di Trevi con l'account già collegato.
- Nessun dato di prova, nessuna pubblicazione.
