# Inventario: bozze salvate, Azzera quantità, storico, passaggio alla Lista della Spesa

## Cosa cambia per l'operatore

1. **Quantità scritte salvate in automatico (bozza)**
   - Mentre scrivi una quantità (e la sua U.M.) viene salvata come bozza circa 1 secondo dopo.
   - Se cambi pagina, ricarichi o apri l'inventario da un altro dispositivo, ritrovi le quantità scritte.
   - La bozza **non** è un conteggio: non conta come "contato", non entra nel Fabbisogno e non genera differenze finché non premi Conferma.
   - Le bozze valgono per la sessione di inventario aperta e sono condivise dagli operatori della stessa azienda.
   - Accanto al campo compare un piccolo segno "bozza salvata".

2. **Pulsante "Azzera quantità"**
   - Svuota tutte le quantità scritte e non ancora confermate (anche le bozze salvate), dopo una richiesta di conferma.
   - Non tocca i conteggi già confermati: quelli restano nello storico.

3. **Modificare un conteggio già confermato**
   - Scrivi la nuova quantità e premi di nuovo Conferma: si aggiunge un nuovo conteggio, che diventa quello valido. Il vecchio resta nello storico (non si cancella).
   - Aggiungo un'etichetta chiara "Modifica" sulle righe già contate, così si capisce che si può ricontare.

4. **Storico della sessione**
   - Nuovo pulsante "Storico conteggi" che apre un elenco di tutti i conteggi confermati nella sessione: data/ora, prodotto, quantità, U.M., differenza, nota, operatore. Le correzioni sono visibili come righe successive.
   - Resta anche lo storico già esistente del singolo prodotto.

5. **Dopo la conferma → Lista della Spesa**
   - Dopo la conferma dei conteggi si apre una finestra: "Vuoi creare la Lista della Spesa?"
   - **Sì, vai alla Lista**: aggiunge i prodotti proposti dal Fabbisogno (le stesse quantità e regole di oggi) e apre la pagina Lista della Spesa.
   - **No, resta qui**: rimani nel Conteggio.
   - Resta attivo il controllo dei prodotti non contati (finestra "Ci sono prodotti non ancora conteggiati").

## Cosa NON cambia
Formule del Fabbisogno, U.M. e confronti, differenze e note obbligatorie, logica "0 digitato = quantità valida", storico append-only, Lista della Spesa.

## Dettagli tecnici
- Database: nuova tabella `inventory_count_drafts` (session_id, product_id, location_id, quantity text, unit_code, updated_by, updated_at; unique su sessione+prodotto+zona), con GRANT, RLS per azienda della sessione tramite `is_company_member`. Scritture solo tramite RPC `manage_inventory_count_draft` (SECURITY DEFINER, search_path=public, autore = auth.uid(), sessione deve essere `in_corso`) con azioni set / clear_one / clear_all. Dopo un conteggio confermato la bozza della riga viene cancellata dalla stessa funzione di conteggio (solo la bozza, lo storico resta intatto).
- Server: nuove funzioni in `inventory-count.functions.ts` con `context.supabase` (identità reale), mai client privilegiato.
- Frontend: `inventory-count-panel.tsx` (bozze con salvataggio ritardato, Azzera, Storico sessione, finestra finale) e `inventory-requirements-panel.tsx` (riuso dell'azione "Aggiungi alla Lista" dalla finestra finale, poi navigazione a `/acquisti/lista-spesa`).
- Storico sessione: lettura da `inventory_count_entries` della sessione, solo in lettura.

Proposta: implementare in 2 passi — Passo 1 bozze + Azzera; Passo 2 storico sessione + passaggio alla Lista.
