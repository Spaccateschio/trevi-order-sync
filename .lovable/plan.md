# Inventario: revisione del concetto (piano tecnico, nessuna implementazione)

Ho analizzato dati e funzioni esistenti. Qui sotto le risposte alle tue sei domande e il piano.

## 1. Colonne già disponibili oggi (nessun dato nuovo)

Dalla funzione `inventory_session_rows` e dalle tabelle collegate:

- Prodotto (codice, descrizione, U.M.), foto
- Giacenza calcolata (`inventory_location_stock`: ultimo conteggio valido + rettifiche + movimenti)
- Quantità fisica, Differenza, Nota, Ultimo conteggio (data e autore)
- Zona, Categoria, Sottocategoria
- Preferito (già collegato alle stelle del catalogo)
- Distinzione **Mai contato** vs **Zero verificato**: esiste già, è il campo `has_count`; oggi non è mostrato come stato a sé

## 2. Colonne che richiedono aggregazioni (dati presenti, calcolo aggiuntivo)

- **Fornitore** e **Prezzo acquisto**: collegamento prodotto→referenza fornitore, poi listino assegnato. Già fatto nella pagina Prodotti: riuso la stessa logica, non ne scrivo una seconda.
- **Scorta minima / Necessario / Fabbisogno**: calcolati da `inventory_requirements` (formula già approvata). Nel Conteggio entrano come colonne di sola lettura: nessuna formula nuova, nessuna decisione d'acquisto.

## 3. Colonne che richiedono dati nuovi

Quattro informazioni oggi non esistono nel database:

1. **Storico dei riconteggi**: `inventory_counts` ha un vincolo unico per sessione+prodotto+zona e la registrazione **sovrascrive** il valore precedente. Quindi oggi 07:00 = 10 e 07:10 = 8 non convivono: resta solo 8.
2. **Da ricontare** (richiesta esplicita di ricontrollo).
3. **Non conforme** + motivazione.
4. **Da proporre per acquisto** (segnalazione dell'operatore, non un ordine).

## 4. Come implementerei "Da ricontare" e il riconteggio append-only

- Nuova tabella `inventory_count_entries`: una riga per ogni conferma (prodotto, zona, sessione, quantità, U.M., nota, chi, quando), **solo inserimenti**, nessuna modifica né cancellazione.
- `inventory_counts` resta com'è e continua a rappresentare **l'ultima fotografia** di quella sessione/zona: la giacenza calcolata non cambia comportamento, FASE B resta intatta.
- "Riconta" non cancella niente: chiede la nuova quantità, scrive una nuova riga nello storico e aggiorna l'ultima fotografia. Sulla scheda compare "Ricontato · ultimo alle 07:10" e uno storico apribile (10 → 8).
- **Da ricontare** = campo `recount_requested_at` (+ chi) sulla fotografia corrente: si accende quando l'operatore chiede il ricontrollo, si spegne alla nuova conferma. Nessuno stato combinato: gli stati restano i tuoi quattro (Mai contato, Da controllare, Confermato, Da ricontare) e la conferma è qualificata come coincidente / surplus / mancanza / zero verificato.

## 5. Come gestirei "Non conforme" (proposta da approvare)

Principio: **la segnalazione non tocca la giacenza**. La quantità fisica resta una sola quantità: quella che c'è in magazzino.

- Sulla riga del conteggio: `non_compliant` (sì/no), `non_compliant_note` (obbligatoria se sì) e, facoltativa, `non_compliant_quantity` come **quantità segnalata**, puramente informativa.
- La giacenza resta la quantità fisica contata: non sottraggo niente automaticamente.
- Lo scarto vero è una decisione separata e già esistente: una **rettifica** (movimento di scarto) che l'operatore o l'amministratore registra esplicitamente. Solo lì la giacenza scende, e resta tracciata.
- In questo modo non introduco il concetto "vendibile vs da scartare" dentro l'inventario: se in futuro serve, lo si aggiunge come dato commerciale, non come seconda giacenza.

Alternativa più semplice, se preferisci: solo flag + nota, senza quantità segnalata. Dimmi quale delle due.

## 6. Preferenze della griglia: nessun secondo sistema

Uso **la stessa tabella** `user_grid_preferences` già usata dalla griglia Prodotti (utente + chiave vista + tipo dispositivo, con visibilità, ordine e larghezza delle colonne nello stesso campo). Cambia solo la chiave della vista, ad esempio `inventario-conteggio`. Nessuna migrazione, nessuna tabella nuova, nessuna logica duplicata: "Ripristina predefinite" funziona come in Prodotti.

## 7. Griglia e filtri (interfaccia)

- Griglia configurabile con colonne fondamentali sempre presenti (Prodotto | Giacenza calcolata | Quantità fisica | Differenza | Stato/Conferma) e colonne opzionali: Preferito, Zona, Categoria, Sottocategoria, Fornitore, Prezzo acquisto, Scorta minima, Necessario, Fabbisogno, Nota, Ultimo conteggio, Non conforme.
- Su smartphone la stessa vista resta a schede compatte (come oggi in Prodotti), con i campi scelti dall'utente.
- Barra principale: Preferiti | Tutti | Da controllare | Da ricontare | Differenze + ricerca. Un pulsante **Filtri** per Zona, Fornitore, Categoria, Sottocategoria, Stato conteggio.
- Le azioni sulla riga restano poche: Conferma, Riconta, e un menu con Preferito, Non conforme, Da proporre per acquisto.

## 8. Confini

Nessuna logica di acquisto dentro l'inventario: niente ripartizione percentuale fra fornitori, niente ordini, niente creazione automatica di righe di spesa. "Da proporre per acquisto" è solo una segnalazione che la Lista della Spesa (FASE C) leggerà come proposta da confermare.

## Ordine di lavoro proposto

1. Database: storico append-only dei conteggi, "Da ricontare", "Non conforme", "Da proporre per acquisto" (una sola migrazione, con permessi).
2. Conteggio: Riconta con storico, i quattro stati, segnalazioni, preferito dalla scheda.
3. Griglia configurabile + nuova barra filtri sulla stessa tabella di preferenze.
4. Colonne di acquisto e fabbisogno in sola lettura.

## Fuori scope

Fabbisogno (formule), Lista della Spesa, ordini, ricevute, FASE A/B/C/D, listini, U.M.

Confermi l'impostazione — in particolare la scelta sul punto 5 (con o senza quantità segnalata)?
