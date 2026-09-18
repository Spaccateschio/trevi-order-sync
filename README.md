# Trevi Fruit Order Hub

Sì. Prima di far partire Lovable con schermate e funzioni, conviene dargli un documento fondativo molto preciso, così Trevi Fruit nasce con un'architettura pulita e non ripetiamo i cambiamenti fatti durante lo sviluppo di Efficio.

La scelta di base che fisserei è questa:

Trevi Fruit non sostituisce Danea. Danea è il master di prodotti, costi, listini e parte amministrativa. Trevi Fruit è il sistema operativo per raccolta ordini e gestione del lavoro.

Inoltre la costruiamo oggi per Trevi Fruit, ma senza scelte tecniche che impediscano domani di trasformarla in OrdinaPro.

Ti consiglio di mandare a Lovable prima questo prompt e chiedergli un piano, senza autorizzarlo ancora a costruire tutto.

PROMPT PER LOVABLE — FONDAZIONE NUOVA WEB APP “TREVI FRUIT”

Voglio iniziare una NUOVA web app da zero, chiamata:

TREVI FRUIT

Non è una modifica di Efficio.

Efficio può essere utilizzato esclusivamente come riferimento per capire alcune funzionalità e gli errori/soluzioni già affrontati, ma non voglio copiare automaticamente la sua architettura, il suo database o la sua complessità.

Prima di implementare voglio che progettiamo una base estremamente solida.

1. SCOPO DELLA WEB APP

Trevi Fruit deve essere il sistema operativo utilizzato dalla nostra azienda per gestire principalmente:

Danea → catalogo → clienti → ordini → preparazione → consegna → Danea

Danea Easyfatt rimane il gestionale amministrativo/commerciale principale.

Trevi Fruit NON deve cercare di sostituire Danea.

Danea continuerà a gestire principalmente

anagrafica prodotti;

codice prodotto;

descrizione;

U.M.;

IVA;

costo/prezzo di acquisto;

fornitore;

listini di vendita;

DDT;

fatture;

contabilità;

analisi economiche e margini.

Trevi Fruit gestirà principalmente

utenti;

clienti;

accesso cliente;

catalogo ricevuto da Danea;

listino assegnato al cliente;

eventuali condizioni commerciali;

raccolta ordini;

ordini interni;

preparazione;

modifiche durante la preparazione;

sostituzioni;

quantità/peso effettivamente preparato;

consegne;

trasportatori;

stato dell'ordine;

comunicazioni/notifiche;

invio/scaricamento ordini verso Danea.

2. PRINCIPIO FONDAMENTALE: DANEA È IL MASTER DEI PRODOTTI

Nella prima versione di Trevi Fruit NON voglio un secondo catalogo prodotti nativo parallelo.

I prodotti commercializzati arrivano da Danea.

Flusso:

Danea → Trevi Fruit

Danea pubblica i prodotti attraverso l'integrazione e-commerce.

Trevi Fruit riceve e conserva i prodotti necessari per mostrarli e utilizzarli operativamente.

Il prodotto deve mantenere stabilmente almeno:

identificativo Danea;

codice Danea;

descrizione;

U.M.;

categoria;

IVA;

listini Danea disponibili;

barcode se presente;

stato pubblicato/non pubblicato;

dati utili ricevuti dal protocollo Danea.

Non creare automaticamente copie dei prodotti in altre anagrafiche.

3. LISTINI DANEA

Danea dispone dei Listini 1–9.

Trevi Fruit deve ricevere e mantenere separatamente:

NetPrice1

NetPrice2

...

NetPrice9

Ogni azienda deve poter assegnare un nome visuale ai nove listini.

Esempio:

1 · BAR
2 · RISTORANTI
3 · HOTEL

Il numero Danea 1–9 rimane sempre il riferimento tecnico.

Il nome è soltanto un'etichetta.

Non modificare mai il significato di NetPrice1–9.

4. CLIENTI

Trevi Fruit deve avere una propria anagrafica cliente operativa.

Ogni cliente deve poter essere:

creato dall'amministratore;

invitato;

abilitato all'accesso al portale;

eventualmente collegato successivamente a informazioni provenienti da Danea.

Per ogni cliente devono essere configurabili almeno:

dati anagrafici;

P.IVA/C.F.;

email;

telefono;

indirizzi;

indirizzo di consegna;

listino Danea assegnato;

eventuale sconto generale;

eventuali condizioni specifiche;

stato attivo/non attivo;

accesso al portale.

Il cliente deve vedere esclusivamente i prezzi che gli competono.

5. MOTORE PREZZI

Costruire il motore prezzi una volta sola e lato server/database, evitando logiche commerciali duplicate nel frontend.

Per la prima versione prevedere una gerarchia semplice e deterministica:

Prezzo base = Listino Danea assegnato al cliente

Successivamente possono intervenire:

prezzo fisso specifico prodotto;

sconto/maggiorazione specifico prodotto;

sconto/maggiorazione categoria;

sconto/maggiorazione generale cliente.

Deve esistere una priorità inequivocabile.

Il frontend non deve decidere autonomamente il prezzo definitivo.

Al momento dell'ordine il prezzo applicato deve essere congelato nella riga dell'ordine.

Se domani cambia il listino Danea, un ordine storico non deve cambiare.

6. PORTALE CLIENTE

Il cliente autenticato deve poter:

visualizzare il catalogo;

cercare prodotti;

filtrare per categoria;

vedere il proprio prezzo;

aggiungere quantità;

utilizzare preferiti;

creare un carrello;

inviare l'ordine;

vedere ordini precedenti;

vedere stato degli ordini.

Interfaccia soprattutto smartphone-first.

Deve essere estremamente veloce ordinare.

Non voglio un e-commerce tradizionale pieno di pagine.

Il cliente deve poter ordinare molti prodotti rapidamente.

7. ORDINE

L'ordine deve avere una propria identità stabile.

Separare chiaramente:

Testata ordine

azienda;

cliente;

numero ordine;

data/ora;

stato;

indirizzo consegna;

eventuale fascia/orario richiesto;

note cliente;

origine ordine;

timestamps operativi.

Riga ordine

Congelare almeno:

riferimento prodotto Danea;

codice Danea;

descrizione;

U.M.;

quantità ordinata;

prezzo unitario applicato;

IVA;

eventuale sconto;

totale;

dati necessari alla successiva esportazione Danea.

Il prodotto può cambiare in futuro, ma l'ordine storico non deve cambiare.

8. STATI DELL'ORDINE

Non utilizzare testi casuali sparsi nel codice.

Definire stati canonici.

Indicativamente:

Ricevuto → In preparazione → Preparato → In consegna → Consegnato

e stati particolari come:

annullato;

problema;

eventualmente parzialmente preparato.

Prima di implementarli proponi una state machine semplice.

Ogni transizione importante deve avere timestamp e utente responsabile.

9. PREPARAZIONE

Questa sarà una delle parti più importanti dell'app.

Il preparatore deve lavorare soprattutto da smartphone/tablet.

Per ogni prodotto deve vedere chiaramente:

Prodotto
Quantità ordinata
U.M.
Note

Durante la preparazione deve poter indicare:

quantità effettiva;

peso effettivo;

prodotto mancante;

sostituzione;

modifica;

nota.

Distinguere SEMPRE:

ordinato dal cliente

da

effettivamente preparato/consegnato.

Non sovrascrivere i dati originali.

10. SOSTITUZIONI

Se il cliente ordina prodotto A e consegniamo prodotto B:

l'ordine deve conservare la memoria di:

A = prodotto originariamente ordinato

e

B = prodotto effettivamente consegnato.

Non modificare semplicemente la riga originale facendo sparire ciò che aveva ordinato il cliente.

11. DANEA SCARICA GLI ORDINI

Trevi Fruit deve avere un endpoint compatibile con il protocollo e-commerce di Danea Easyfatt.

Flusso:

Trevi Fruit → Danea

Danea richiede gli ordini.

Trevi Fruit restituisce l'XML nel formato ufficiale previsto.

Per ogni prodotto devono essere utilizzati i dati Danea, in particolare:

codice Danea;

descrizione;

quantità;

U.M.;

prezzo di vendita effettivamente applicato;

IVA.

NON inviare il costo di acquisto nell'ordine.

Danea possiede già il prodotto e il relativo costo nella propria anagrafica e deve poter calcolare i margini utilizzando i propri dati.

La generazione XML deve essere server-side.

12. PROTEZIONE DAL DOPPIO INVIO A DANEA

Progettare fin dall'inizio un sistema affidabile per sapere:

ordine disponibile;

ordine esposto a Danea;

ordine scaricato;

eventuale esportazione manuale;

data/ora;

postazione Danea;

risultato.

Un ordine non deve essere duplicato per retry o richieste ripetute.

Utilizzare identificativi stabili e idempotenza.

13. CREDENZIALI DANEA

Le credenziali per gli endpoint Danea devono essere server-side.

Mai nel browser.

Prevedere postazioni Danea autorizzate con:

nome;

username;

password hash;

attiva/revocata;

ultimo utilizzo;

log.

Non memorizzare password in chiaro.

14. SICUREZZA

Trevi Fruit deve essere progettato come se in futuro diventasse OrdinaPro.

Quindi ogni tabella business deve essere isolabile per azienda.

Usare un identificativo azienda, ad esempio:

company_id

anche se inizialmente esiste una sola azienda:

Trevi Fruit

Nessun utente deve poter accedere ai dati di un'altra azienda modificando ID nel browser.

Applicare RLS coerenti.

Le funzioni server-side devono verificare azienda e autorizzazioni.

15. RUOLI

Non creare decine di ruoli inizialmente.

Partire con ruoli semplici:

Amministratore
accesso completo.

Operatore
ordini/preparazione/operatività.

Trasportatore
solo consegne assegnate e funzioni necessarie.

Cliente
solo propria azienda/anagrafica/catalogo/ordini.

Progettare però il modello in modo estendibile.

16. AUDIT LOG

Le operazioni importanti devono essere tracciabili.

Esempi:

cambio prezzo/condizione cliente;

cambio listino;

modifica ordine;

inizio preparazione;

sostituzione;

chiusura preparazione;

partenza consegna;

consegna;

operazioni Danea.

Registrare:

chi → cosa → quando

senza creare log inutilmente giganteschi.

17. CONCORRENZA E IDEMPOTENZA

Questo punto è fondamentale.

Più persone possono lavorare contemporaneamente.

Esempi:

due operatori aprono lo stesso ordine;

doppio click del cliente;

Danea richiede due volte;

connessione cade durante checkout;

preparatore conferma due volte.

Le operazioni economiche e di stato importanti devono essere atomiche e idempotenti.

Non affidarsi soltanto a pulsanti disabilitati nel frontend.

18. RESPONSIVE

Trevi Fruit deve essere progettato dall'inizio per:

desktop + tablet + smartphone

Non realizzare prima enormi tabelle desktop da comprimere successivamente sul telefono.

Desktop:
tabelle compatte e operative.

Tablet:
interfaccia ridotta alle informazioni necessarie.

Smartphone:
righe/card compatte, pulsanti facilmente utilizzabili e niente scrolling orizzontale per le operazioni quotidiane.

19. PERFORMANCE

Non creare architetture con una query per ogni prodotto.

Cataloghi e prezzi devono poter essere caricati in batch/paginati.

Prevedere:

ricerca;

filtri;

paginazione/infinite loading;

indici database corretti;

query tenant-safe.

Pensare fin dall'inizio a cataloghi di migliaia di prodotti e molti clienti.

20. COSA NON VOGLIO NELLA PRIMA VERSIONE

Non implementare adesso:

catalogo Efficio parallelo;

prodotti Efficio → Danea;

marketplace;

abbonamenti;

fatturazione SaaS;

multi-fornitore complesso;

contabilità;

fatturazione;

DDT;

gestione fiscale;

replica delle funzioni amministrative di Danea;

funzioni AI non necessarie.

Dobbiamo prima fare molto bene il ciclo dell'ordine.

21. FUTURO ORDINA PRO

Trevi Fruit nasce per una sola azienda reale.

Ma se il progetto funziona vogliamo poterlo trasformare in:

OrdinaPro

piattaforma utilizzabile da più fornitori.

Per questo:

company_id fin dall'inizio;

configurazioni per azienda;

credenziali Danea per azienda;

nomi listini per azienda;

clienti isolati per azienda;

prodotti Danea isolati per azienda;

ordini isolati per azienda;

branding separabile.

Non implementare oggi il SaaS multi-azienda, ma non creare vincoli che rendano necessario riscrivere il database domani.

22. PRIMA FASE: NON COSTRUIRE TUTTO

Prima di implementare voglio da te un PIANO TECNICO DELLA FONDAZIONE.

Analizza questa specifica e proponimi:

architettura generale;

schema database iniziale;

relazioni principali;

sistema autenticazione e ruoli;

isolamento company_id e RLS;

modello prodotti Danea;

modello listini Danea;

modello clienti;

motore prezzi;

modello ordine/testata/righe;

state machine ordine;

integrazione Danea prodotti;

endpoint ordini Danea;

idempotenza;

audit;

struttura frontend;

strategia responsive;

fasi di implementazione.

IMPORTANTE

NON implementare ancora tutta l'app.

Prima dammi il piano.

Voglio verificare insieme l'architettura prima che vengano create tabelle e logiche difficili da cambiare.

colori giallo ocra e blu notte

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://trevi-order-sync.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c19c798b-28ff-477b-b966-6d54b0d84389).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
