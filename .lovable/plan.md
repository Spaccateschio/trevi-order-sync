# Clienti: tabella adattiva, intestazione fissa ed esportazione selezionati

## Obiettivo
Rendere l’elenco clienti più leggibile e operativo senza barra di scorrimento orizzontale, mantenendo sempre chiaro a quale colonna appartiene ogni dato.

## Interventi

### 1. Intestazione sempre visibile
- L’intestazione delle colonne resterà fissata durante lo scorrimento verticale della pagina.
- Checkbox, titoli e ordinamento resteranno allineati ai dati sottostanti.

### 2. Colonne adattive e ridimensionabili
- La tabella occuperà sempre la larghezza disponibile, senza barra di scorrimento orizzontale.
- Ogni colonna avrà un separatore verticale visibile.
- Il bordo destro dell’intestazione potrà essere trascinato per allargare o restringere la colonna; anche i dati seguiranno la stessa larghezza.
- Le larghezze scelte resteranno memorizzate sul dispositivo.
- Quando sono selezionate molte colonne, caratteri, spaziature e larghezze si ridurranno automaticamente; i testi troppo lunghi saranno abbreviati, con contenuto completo disponibile passando sopra.
- Denominazione e selezione conserveranno una larghezza minima utile; le altre colonne condivideranno lo spazio restante.

### 3. Listino bloccato nell’elenco
- Nella schermata iniziale il listino sarà mostrato come testo e non sarà modificabile accidentalmente.
- La modifica resterà disponibile esclusivamente dentro **Dettagli cliente → Rapporti commerciali**.

### 4. Stampa ed esportazione dei selezionati
- Quando uno o più clienti sono selezionati, la barra azioni mostrerà **Stampa**, **Salva Excel** e **Salva CSV**.
- Ogni uscita conterrà esclusivamente i clienti selezionati e le colonne attualmente visibili, nello stesso ordine della tabella.
- Il listino verrà esportato con il nome Danea associato e il collegamento come stato leggibile.
- La stampa userà un layout compatto orizzontale con intestazioni ripetute sulle pagine.

### 5. Verifica
- Controllo desktop della permanenza dell’intestazione, ridimensionamento, assenza di scorrimento orizzontale e allineamento verticale.
- Controllo con poche e molte colonne visibili.
- Controllo dei file Excel/CSV e della stampa con una selezione multipla.
- Verifica smartphone senza modificare l’attuale elenco compatto.

## File previsti
- `src/components/companies/customer-records-panel.tsx`
- `src/lib/customer-columns.ts`
- un piccolo modulo dedicato alla stampa/esportazione clienti
- `roadmap.md` per registrare e chiudere l’attività

## Limiti
- Nessuna modifica a database, importazione Danea, listini, collegamenti, inviti o permessi.
- Nessuna modifica al dettaglio cliente oltre a mantenere lì l’unico controllo per cambiare listino.
