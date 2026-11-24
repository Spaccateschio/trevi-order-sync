# Prezzo nella card della Lista della Spesa

## Situazione attuale
Nei filtri «Visualizza dati» esiste già la voce «Prezzo acquisto», ma il prezzo compare solo se, per ogni fornitore, apri i tre puntini e scegli «Dettagli (prezzo, U.M., B2B)». Inoltre la parte Fornitori ora è chiusa di default, quindi il prezzo di fatto non si vede.

## Cosa cambia
- Con «Prezzo acquisto» attivo nei filtri, nella card compare subito una riga piccola con il **prezzo indicativo del fornitore scelto** (es. «€ 1,20 / kg netto»), visibile anche con la parte Fornitori chiusa.
- Con più fornitori stellati: un prezzo per ciascuno, con nome abbreviato.
- Senza prezzo: «Prezzo su richiesta».
- Con «Prezzo acquisto» spento: nessun prezzo, come oggi.
- Nessun totale in euro, nessun dato salvato: è solo visualizzazione.

## Dettagli tecnici
- File: `src/components/shopping/card-suppliers.tsx` (la riga prezzo non dipende più da `details`, solo da `show.price`) e, se serve per il riassunto chiuso, `shopping-list-card.tsx`.
- Prezzi già letti oggi (B2B `applicable_b2b_price`, non B2B `manual_danea_cost`): nessuna nuova lettura, nessuna modifica al database.
- Tre puntini, salvataggi e Inventario restano invariati.
