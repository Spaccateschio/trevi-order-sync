# Inventario: vista Card / Righe, card compatte e tasti rapidi con U.M.

Lavoro solo sulla visualizzazione della pagina Inventario. Database, inventari salvati, Lista della Spesa, Fabbisogno, Ordini e semaforo non si toccano.

## Risposte alle tue 8 domande (analisi del codice attuale)

1. **Selettore Card / Righe**: due pulsanti «▦ Card» e «☷ Righe» nella barra in alto dei prodotti, accanto a «Preferiti / Tutti». La scelta resta memorizzata sul dispositivo (niente database). Predefinita: Card.
2. **Quante card entrano oggi**: la griglia oggi è rigida — 1 colonna sotto 768 px, 2 da 768 px, 3 da 1280 px. Non guarda lo spazio reale, quindi un telefono largo mostra sempre 1 card e un monitor grande si ferma a 3.
3. **Larghezza minima proposta**: circa **300 px** per card (serve per foto 48 px + nome, campo quantità + U.M. + Conferma, e i 4 tasti rapidi leggibili). Con una griglia che si adatta allo spazio del contenitore, indicativamente:

```text
spazio disponibile   card per riga
< 620 px             1
620 – 930 px         2   (anche telefono largo/orizzontale, tablet)
930 – 1240 px        3
> 1240 px            4   (massimo)
```

4. **Modalità Righe compatta**: una riga alta circa una riga di tabella: Foto piccola | Codice | Prodotto | Categoria | Ultimo conteggio | Quantità | U.M. | +1 +3 +5 +10 | Conferma | ⋮. Si conta direttamente dalla riga, senza aprire il prodotto. Su schermi stretti Categoria e Ultimo conteggio vanno sotto il nome, i tasti restano.
5. **Blocco giallo ocra**: oggi la card bloccata ha già bordo e sfondo ocra e i comandi disattivati; «Sblocca quantità» la riporta al colore normale. La vista Righe userà la **stessa identica regola** (stesso colore ocra, lucchetto e comandi disattivati), perché legge lo stesso stato.
6. **+1/+3/+5/+10 oggi**: sommano il numero alla quantità scritta, **nella U.M. selezionata, senza conversioni** (3 casse +5 = 8 casse). Manca solo l'etichetta: oggi si legge «+1», dopo si leggerà «+1 kg», «+3 pz», «+5 cs» secondo l'U.M. scelta. Il cambio U.M. resta quello attuale dell'Inventario (solo U.M. già abilitate per il prodotto, nessuna nuova U.M., nessuna equivalenza inventata).
7. **Passando Card ↔ Righe**: quantità scritte, bozze, U.M. scelte e blocco sono conservati nella pagina, non dentro la singola card: cambiare vista non perde nulla.
8. **File da modificare**: solo `src/components/inventory/inventory-count-panel.tsx`.

## Card più compatte

Resta in vista: foto + codice + nome, categoria, ultimo conteggio, quantità + U.M., +1 +3 +5 +10, Conferma, stella e menu ⋮. Le informazioni secondarie (fornitore, prezzo, giacenza estesa, note) vanno nel menu ⋮ o in una riga ridotta.

## Dettagli tecnici

- Griglia: `grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr))` con massimo 4 colonne (container query sulla sezione prodotti).
- Nuovo componente interno `ProductRow` nello stesso file, che riceve le stesse props di `ProductCard` (drafts, unitsCtx, cycleLock, correzione) — nessuna logica duplicata sui dati.
- Preferenza vista in localStorage, letta dopo il caricamento pagina per evitare sfarfallii.
- `CatalogProductCard` (articoli dal catalogo fornitore) segue la stessa griglia e avrà una versione riga equivalente.
