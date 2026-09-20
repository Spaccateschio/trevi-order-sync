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

Le pagine, i permessi, i dati e la logica esistenti restano invariati. La futura personalizzazione di visibilità e ordine sarà indipendente dai permessi: in questa fase si prepara una struttura dati di navigazione compatibile, senza costruire ancora l'editor delle preferenze.

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
```

- Il titolo di ogni categoria apre la relativa dashboard.
- Una freccia separata espande o chiude le sottocategorie, evitando conflitti tra apertura pagina e tendina.
- Le categorie e sottocategorie rispettano capacità aziendali e ruoli già esistenti.
- Il menu non concede permessi: mostra solo destinazioni già autorizzate.
- Le sezioni aperte seguono la posizione corrente, così il percorso resta comprensibile.

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
Card per Azienda, Magazzino / Zone, Account e Gestionale / Danea. Le card rispettano i ruoli: le destinazioni amministrative non sono mostrate come accessibili a chi non è amministratore.

## Implementazione prevista dopo approvazione

1. Rendere la configurazione della navigazione gerarchica e riutilizzabile, mantenendo separati requisiti di accesso e futura visibilità personalizzata.
2. Semplificare il menu desktop con categorie espandibili e il menu smartphone con soli ingressi principali.
3. Trasformare `/dashboard`, `/acquisti` e `/vendite` in dashboard compatte senza testo “In arrivo” ridondante.
4. Creare le sole pagine-indice `/b2b` e `/impostazioni`, necessarie alla gerarchia richiesta.
5. Aggiungere l'apertura diretta di Fabbisogno e Magazzino tramite parametro della pagina, senza spostare o duplicare i contenuti.
6. Verificare desktop e smartphone, navigazione avanti/indietro, evidenziazione corrente, autorizzazioni e tutte le route esistenti.

## File previsti

- `src/lib/navigation.ts`
- `src/components/app-shell.tsx`
- `src/routes/_authenticated/dashboard.tsx`
- `src/routes/_authenticated/acquisti.index.tsx`
- `src/routes/_authenticated/vendite.tsx`
- `src/routes/_authenticated/acquisti.inventario.tsx`
- `src/components/inventory/inventory-count-panel.tsx`
- `src/routes/_authenticated/amministrazione.tsx`
- Nuove route: `src/routes/_authenticated/b2b.tsx`, `src/routes/_authenticated/impostazioni.tsx`
- Eventuali piccoli componenti visuali condivisi creati appositamente per le dashboard

Non sono previste modifiche a database, funzioni server, RPC, formule, import Danea o pagine operative interne.
