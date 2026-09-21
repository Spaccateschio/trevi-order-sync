# Acquisti → Prodotti: seconda vista dello stesso catalogo, scheda unica a tab

Nessuna nuova tabella, RPC, permesso o logica commerciale. Nessuna seconda anagrafica:
gli stessi prodotti, la stessa scheda, solo contesto iniziale e colonne diverse.

## Risposta alla domanda: l'architettura lo permette?

Sì, con una riorganizzazione del codice esistente (nessuna duplicazione):

- **Griglia** — le colonne sono già un elenco unico condiviso e le preferenze (visibilità,
  ordine, larghezze, ordinamento) sono salvate per utente + vista + dispositivo. Basta
  usare un nome vista diverso ("acquisti.prodotti") con un ordine di colonne iniziale
  diverso: stessi dati, stessi componenti.
- **Ostacolo reale** — oggi tutta la pagina Prodotti (ricerca, filtri, colonne, selezione
  multipla, import Danea, scheda) vive dentro il file della pagina Vendite. Per riusarla
  la sposto in un unico componente condiviso `ProductsWorkspace`, usato da entrambe le
  voci con due parametri: nome vista/colonne iniziali e tab iniziale della scheda.
  La pagina Vendite continua a funzionare esattamente come adesso.
- **Scheda prodotto** — i pannelli esistenti (impostazioni, U.M., fornitori, inventario,
  provenienze, dati Danea) restano gli stessi: li raggruppo in quattro tab
  **Prodotto | Vendita | Acquisto | Inventario** e aggiungo un parametro `initialTab`.

## Cosa cambia

1. **Nuova voce di menu** Acquisti → Prodotti (`/acquisti/prodotti`), visibile a chi ha il
   profilo di acquisto, con card nella dashboard Acquisti.
2. **Stesso elenco prodotti** dell'azienda; da qui la scheda si apre sul tab **Acquisto**,
   da Vendite → Prodotti sul tab **Vendita**.
3. **Colonne iniziali diverse** (poi personalizzabili come sempre):
   - Acquisti: descrizione, codice, U.M. base, fornitore/referenza e codice fornitore,
     costo netto, categoria.
   - Vendite: come oggi (codice, descrizione, U.M. vendita e predefinita, listino 1,
     immagine, stato).
4. **Scheda a tab**: Prodotto (immagine, vetrina B2B, disponibilità, categorie, dati Danea),
   Vendita (U.M. del prezzo e U.M. di vendita), Acquisto (fornitori e referenze con le
   U.M. acquistabili), Inventario (giacenza e provenienze).

## Limite da dire subito

Le colonne "U.M. acquistabili", "priorità di approvvigionamento", "giacenza" e "fabbisogno"
non esistono nell'elenco attuale: quei dati oggi si leggono prodotto per prodotto dentro la
scheda, non nell'elenco. Metterli in colonna richiede una lettura aggregata aggiuntiva.
Proposta: in questo intervento la vista Acquisti usa le colonne già disponibili (incluso
fornitore e costo) e le colonne aggregate le aggiungo come passo successivo dedicato.

## Note tecniche

- Nuovo `src/components/products/products-workspace.tsx`: il corpo attuale di
  `vendite_.prodotti.tsx` spostato senza modifiche funzionali, con props
  `gridKey`, `defaultColumnOrder`/visibilità iniziale, `initialTab`, `title`/`description`.
- `vendite_.prodotti.tsx` diventa un guscio di route (head + `<ProductsWorkspace …>`);
  `gridKey` resta `"vendite.prodotti"` così le preferenze già salvate non si perdono.
- Nuovo `src/routes/_authenticated/acquisti_.prodotti.tsx` con `gridKey="acquisti.prodotti"`.
- `product-detail-sheet.tsx`: wrapper `Tabs` (shadcn) attorno ai pannelli esistenti +
  prop `initialTab`; nessun pannello riscritto.
- `src/lib/navigation.ts`: nuova voce `acquisti.prodotti`.
- Nessuna migrazione, nessuna modifica a RPC, RLS, Danea, listini o inventario.
