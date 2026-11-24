# Card Lista: fornitori in alto, sezione fornitori apribile con freccia

## Perché oggi sembra mancare qualcosa nei tre puntini
Le voci del menu non sono state cancellate: «Aggiungi fornitore» e «Rimuovi dalla Lista» si nascondono quando la card è confermata o già in ordine (come l'Anguria «In ordine»). Restano solo «Fornitori e ripartizione» e la nota. Lo rendo chiaro invece di farle sparire.

## Cosa cambia sulla card
1. **In alto (fascia colorata)**: si vedono tutti i fornitori della riga, il preferito (stella) per primo. Con 2 o più fornitori i nomi sono accorciati uno accanto all'altro (es. «Cartoleria Viva… · trevi srl…»), con il nome intero passandoci sopra.
2. **In basso**: il nome del fornitore non si ripete più. Al suo posto una riga chiusa **«Fornitori ▸»** con il riassunto breve (es. «2 fornitori · assegnato 5/5 kg»).
3. **Premendo la freccia** si apre la parte fornitori, sulla stessa card:
   - ogni fornitore con la sua quantità e U.M., modificabile direttamente;
   - **«+ Aggiungi fornitore»**: scelgo il fornitore e scrivo subito la quantità, nella stessa riga, senza aprire altre finestre;
   - **«Acquisto diretto»** con la sua quantità.
4. **Tre puntini**: tornano sempre visibili «Aggiungi fornitore» e «Rimuovi dalla Lista»; se la card è confermata o in ordine compaiono grigie con la spiegazione («Sblocca la card per modificare» / «Già in ordine»), mai nascoste.

Non sdoppio la card: con la sezione apribile i fornitori restano tutti nella stessa card, più semplice da leggere. Se dopo la prova preferisci le due card affiancate, lo facciamo dopo.

## Cosa non cambia
Salvataggi, regole di ripartizione, stelle, U.M. del fornitore, Carrello e invio ordini restano identici: cambia solo come la card li mostra.

## Dettagli tecnici
- Solo `src/components/shopping/shopping-list-card.tsx` (presentazione): intestazione con elenco fornitori ordinato per is_preferred, troncato con `truncate` + `title`; blocco `show.suppliers` dentro `Collapsible` shadcn chiuso di default, stato locale non salvato.
- Riga «Aggiungi fornitore» in linea riusa i gestori già esistenti (manage_product_supplier_link / assign_shopping_list_supplier tramite i callback attuali); «Acquisto diretto» riusa set_shopping_list_direct_quota tramite il percorso esistente.
- Menu: voci sempre renderizzate, `disabled` quando `!editable`, con sottotesto del motivo.
- Prove solo visive su 3 EMME, senza invii.
