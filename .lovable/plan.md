# Riorganizzazione della navigazione Trevi Fruit

## Obiettivo

Separare il lavoro quotidiano dalle configurazioni con la gerarchia:

```text
Panoramica
├── Operatività
│   ├── Acquisti
│   ├── Vendite
│   └── B2B
└── Sistema
    └── Impostazioni
```

Le pagine, i permessi e la logica operativa esistenti restano invariati. In questa fase viene realizzata anche la personalizzazione persistente della navigazione per singolo utente. Permessi e personalizzazione restano rigorosamente separati: le preferenze possono soltanto nascondere, mostrare o riordinare destinazioni già autorizzate.

## Mappa approvabile delle pagine esistenti

| Voce attuale / funzione reale | Nuova categoria | Nuova sottocategoria | Route mantenuta | Stato attuale |
|---|---|---|---|---|
| Panoramica | Panoramica | — | `/dashboard` | Funzionante; diventerà dashboard visuale delle aree |
| Acquisti | Operatività → Acquisti | Dashboard Acquisti | `/acquisti` | Esiste; va sostituito il contenuto obsoleto con card compatte |
| Lista della Spesa | Acquisti | Lista della Spesa | `/acquisti/lista-spesa` | Funzionante |
| Ordini fornitore | Acquisti | Ordini fornitore | `/acquisti/ordini` | Funzionante |
| Inventario | Acquisti | Inventario | `/acquisti/inventario` | Funzionante |
| Fabbisogno, oggi sezione interna di Inventario | Acquisti | Fabbisogno | `/acquisti/inventario?sezione=fabbisogno` | Funzionante; apertura diretta della sezione, nessuna duplicazione |
| Fornitori | Acquisti | Fornitori | `/acquisti/fornitori` | Funzionante |
| Catalogo fornitori | Acquisti | Catalogo fornitori | `/acquisti/catalogo` | Funzionante; scelta confermata in Acquisti |
| Catalogo del singolo fornitore | Acquisti | Percorso interno al Catalogo | `/acquisti/catalogo/$sellerId` | Funzionante; non diventa voce autonoma |
| Scheda prodotto del fornitore | Acquisti | Percorso interno al Catalogo | `/acquisti/catalogo/$sellerId/$productId` | Funzionante; non diventa voce autonoma |
| Vendite | Operatività → Vendite | Dashboard Vendite | `/vendite` | Esiste; va trasformata in dashboard visuale |
| Ordini clienti | Vendite | Ordini clienti | Nessuna route esistente | Non verrà inventata; card informativa non cliccabile |
| Clienti | Vendite | Clienti | `/vendite/clienti` | Funzionante |
| Prodotti | Vendite | Prodotti | `/vendite/prodotti` | Funzionante |
| Preparazione | Vendite | Preparazione | `/operativo` | Pagina esistente “In arrivo”; resta visibile e cliccabile |
| Consegne | Vendite | Consegne | `/consegne` | Pagina esistente “In arrivo”; resta visibile e cliccabile |
| Collegamenti | Operatività → B2B | Collegamenti | `/collegamenti` | Funzionante: connessioni, richieste, ricerca, inviti e codici |
| B2B | Operatività → B2B | Dashboard B2B | nuova `/b2b` | Nuova sola pagina-indice; nessuna nuova funzione |
| Azienda | Sistema → Impostazioni | Azienda | `/amministrazione` | Dati generali e indirizzi funzionanti; alcune sezioni future |
| Magazzino / Zone, oggi sezione interna di Azienda | Impostazioni | Magazzino / Zone | `/amministrazione?sezione=magazzino` | Funzionante; apertura diretta della sezione, nessuna duplicazione |
| Account | Impostazioni | Account personale | `/account` | Funzionante |
| Utenti e ruoli | Impostazioni | Utenti e ruoli | Nessuna route esistente | Non verrà creata né mostrata come funzione attiva |
| Gestionale | Impostazioni | Danea / Gestionale | `/danea` | Funzionante e riservato agli amministratori |
| Personalizzazione navigazione | Impostazioni | Personalizzazione → Navigazione | nuova `/impostazioni/navigazione` | Nuova schermata per menu laterale e dashboard |
| Impostazioni | Sistema | Dashboard Impostazioni | nuova `/impostazioni` | Nuova sola pagina-indice verso le configurazioni esistenti |
| Onboarding | Percorso di sistema | Configurazione iniziale | `/onboarding` | Automatico; non compare nel menu |

Le route pubbliche (`/`, `/auth`, `/reset-password`, `/invito/$token`, `/consegna/$token`) e gli endpoint tecnici restano fuori dal menu autenticato e non vengono modificati.

## Nuovo menu laterale desktop

```text
Panoramica

OPERATIVITÀ
▾ Acquisti                 → /acquisti
  Lista della Spesa        → /acquisti/lista-spesa
  Ordini fornitore         → /acquisti/ordini
  Inventario               → /acquisti/inventario
  Fabbisogno               → /acquisti/inventario?sezione=fabbisogno
  Fornitori                → /acquisti/fornitori
  Catalogo fornitori       → /acquisti/catalogo

▾ Vendite                  → /vendite
  Clienti                  → /vendite/clienti
  Prodotti                 → /vendite/prodotti
  Preparazione             → /operativo
  Consegne                 → /consegne

▾ B2B                      → /b2b
  Collegamenti             → /collegamenti

SISTEMA
▾ Impostazioni             → /impostazioni
  Azienda                  → /amministrazione
  Magazzino / Zone         → /amministrazione?sezione=magazzino
  Account                  → /account
  Gestionale / Danea       → /danea
  Personalizzazione        → /impostazioni/navigazione
```

- Il titolo di ogni categoria apre la relativa dashboard.
- Una freccia separata espande o chiude le sottocategorie, evitando conflitti tra apertura pagina e tendina.
- Le categorie e sottocategorie rispettano capacità aziendali e ruoli già esistenti.
- Il menu non concede permessi: mostra solo destinazioni già autorizzate.
- Le sezioni aperte seguono la posizione corrente, così il percorso resta comprensibile.
- Una voce nascosta dall'utente resta disponibile nella schermata Personalizzazione, se l'utente è ancora autorizzato, così può essere riattivata.

## Navigazione smartphone

Nessun menu annidato complesso. La barra inferiore mostra solo gli ingressi principali consentiti:

```text
Panoramica · Acquisti · Vendite · B2B · Impostazioni
```

Le funzioni si raggiungono dalle card touch della relativa dashboard. Se lo spazio non consente tutte le aree, le voci saranno selezionate in base alle capacità e ai ruoli già esistenti, senza mostrare funzioni non autorizzate.

## Dashboard visuali

### Panoramica
Card compatte e cliccabili per Acquisti, Vendite, B2B e Impostazioni. Ogni card mostra icona, nome, breve descrizione e un riepilogo delle funzioni disponibili. Le card Acquisti/Vendite compaiono solo se l'azienda ha la relativa capacità; Impostazioni rispetta i ruoli delle singole destinazioni.

### Acquisti
Card per Lista della Spesa, Ordini fornitore, Inventario, Fabbisogno, Fornitori e Catalogo fornitori. Fabbisogno apre direttamente la sezione reale dentro Inventario.

### Vendite
Card per Clienti, Prodotti, Preparazione e Consegne. “Ordini clienti” può essere mostrata come funzione non ancora disponibile, senza creare una route o logica finta.

### B2B
Card per Collegamenti. La pagina spiega in modo minimo che qui si gestiscono rapporti, richieste e inviti; Catalogo non viene duplicato perché è stato confermato in Acquisti.

### Impostazioni
Card per Azienda, Magazzino / Zone, Account, Gestionale / Danea e Personalizzazione. Le card rispettano i ruoli: le destinazioni amministrative non sono mostrate come accessibili a chi non è amministratore. La card Personalizzazione resta sempre raggiungibile, per evitare che un utente perda il modo di riattivare ciò che ha nascosto.

## Personalizzazione per singolo utente

### Verifica della struttura esistente

Esiste già `user_grid_preferences`, usata dalla griglia Prodotti. Non è adatta a essere estesa: identifica una griglia e un tipo di dispositivo e salva specificamente colonne, dimensioni e ordinamento della tabella. Inserirvi menu e dashboard mescolerebbe preferenze con significati diversi e renderebbe fragile l'evoluzione di entrambe.

### Struttura dati proposta — richiede approvazione prima della migrazione

Creare una tabella dedicata `user_navigation_preferences`, con una riga per utente e azienda attiva:

- `user_id`: proprietario delle preferenze;
- `company_id`: contesto aziendale, perché le funzioni autorizzate dipendono dall'azienda e dal ruolo ricoperto;
- `sidebar_items`: ordine e visibilità delle categorie/sottocategorie del menu;
- `dashboard_items`: ordine e visibilità delle card delle dashboard;
- date di creazione e aggiornamento;
- unicità `(user_id, company_id)`;
- accesso consentito soltanto al proprietario, all'interno della propria azienda attiva.

La tabella avrà permessi espliciti e protezione per `company_id = get_user_company_id()` insieme a `auth.uid() = user_id`. Non saranno create funzioni con privilegi elevati: lettura, salvataggio e ripristino possono avvenire con l'utente autenticato e le regole del database.

### Comportamento

- **Menu laterale**: mostra/nascondi e riordina categorie e sottocategorie autorizzate.
- **Dashboard**: mostra/nascondi e riordina le card autorizzate, sia nella Panoramica sia nelle dashboard di area.
- **Ripristina predefiniti**: elimina la preferenza salvata e torna all'ordine ufficiale Trevi Fruit.
- Le nuove funzioni aggiunte in futuro entrano con il valore predefinito definito dall'app, senza invalidare preferenze più vecchie.
- Le preferenze memorizzano chiavi stabili delle voci, mai URL arbitrari.
- Prima di mostrare o salvare una voce, l'app ricalcola sempre le autorizzazioni correnti. Una chiave non autorizzata viene ignorata anche se presente nei dati salvati.
- Nascondere non revoca permessi; mostrare non concede permessi; l'accesso diretto alle route continua a dipendere esclusivamente dai controlli esistenti.
- Preparazione e Consegne restano visibili e cliccabili per impostazione predefinita, ma l'utente può nasconderle.
- Ordini clienti resta una card informativa non cliccabile; può essere mostrata, nascosta e riordinata come le altre card.

### Schermata Impostazioni → Personalizzazione → Navigazione

Due sezioni semplici:

1. **Menu laterale** — elenco gerarchico delle sole voci autorizzate, interruttore mostra/nascondi e comandi di riordino.
2. **Dashboard** — card raggruppate per dashboard, interruttore mostra/nascondi e comandi di riordino.

Un comando “Ripristina predefiniti” richiede conferma e ripristina entrambe le sezioni. Su smartphone il riordino usa pulsanti su/giù, non trascinamenti difficili da usare; su desktop si mantiene lo stesso comportamento chiaro e accessibile.

## Implementazione prevista dopo approvazione

1. Creare la preferenza di navigazione per utente e azienda, con protezioni che impediscono accessi incrociati.
2. Rendere la configurazione della navigazione gerarchica e riutilizzabile, separando requisiti di accesso e preferenze personali.
3. Creare la schermata `/impostazioni/navigazione` con mostra/nascondi, riordino e ripristino.
4. Semplificare il menu desktop con categorie espandibili e il menu smartphone con soli ingressi principali personalizzati.
5. Trasformare `/dashboard`, `/acquisti` e `/vendite` in dashboard compatte e personalizzabili, senza testo “In arrivo” ridondante.
6. Creare le sole pagine-indice `/b2b` e `/impostazioni`, necessarie alla gerarchia richiesta.
7. Aggiungere l'apertura diretta di Fabbisogno e Magazzino tramite parametro della pagina, senza spostare o duplicare i contenuti.
8. Verificare desktop e smartphone, persistenza dopo nuovo accesso, ripristino, navigazione, autorizzazioni e tutte le route esistenti.

## File previsti

- `src/lib/navigation.ts`
- Nuova gestione delle preferenze di navigazione lato interfaccia
- `src/components/app-shell.tsx`
- `src/routes/_authenticated/dashboard.tsx`
- `src/routes/_authenticated/acquisti.index.tsx`
- `src/routes/_authenticated/vendite.tsx`
- `src/routes/_authenticated/acquisti.inventario.tsx`
- `src/components/inventory/inventory-count-panel.tsx`
- `src/routes/_authenticated/amministrazione.tsx`
- Nuove route: `src/routes/_authenticated/b2b.tsx`, `src/routes/_authenticated/impostazioni.tsx`, `src/routes/_authenticated/impostazioni.navigazione.tsx`
- Eventuali piccoli componenti visuali condivisi creati appositamente per le dashboard
- Una migrazione per `user_navigation_preferences`, solo dopo approvazione esplicita della struttura proposta

Non sono previste modifiche a funzioni server, RPC, formule, import Danea o pagine operative interne. L'unica modifica al database proposta è la tabella dedicata alle preferenze personali descritta sopra.
