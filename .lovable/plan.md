# Associare un fornitore direttamente dalla card della Lista

## Obiettivo
Dalla card del prodotto nella Lista della Spesa si sceglie un fornitore qualsiasi dell'anagrafica e lo si collega al prodotto, senza andare in altre pagine. Il collegamento resta salvato: il prodotto lo ritrova nelle prossime Liste e ordini, e il fornitore lo vede tra i suoi prodotti.

## Cosa si vede nella card
- Nella sezione FORNITORI, sotto i fornitori già collegati, un tasto **«+ Aggiungi fornitore»**.
- Si apre un piccolo elenco con ricerca su tutti i fornitori dell'anagrafica (esclusi quelli già collegati).
- Scelto il fornitore:
  - **Non B2B**: si può indicare subito prezzo (facoltativo), U.M. del prezzo (facoltativa) e U.M. d'acquisto (esistente oppure «Altra U.M.»). Poi Quantità + Salva come oggi.
  - **B2B**: il collegamento si crea, ma U.M. e prezzo restano quelli pubblicati dal venditore (regola già in vigore, non cambia). Se il prodotto del venditore non è collegato resta il messaggio «Prodotto del fornitore non collegato: U.M. non disponibili».
- Opzione **«Rendi preferito per questo prodotto»** per metterlo come fornitore principale dei prossimi acquisti.
- Dal menu del fornitore nella card: **«Scollega dal prodotto»** (disattiva il collegamento, non cancella ordini, ripartizioni o storico).

## Dove si salva
- Il collegamento prodotto↔fornitore è lo stesso che oggi si gestisce dalla scheda Prodotto e dalla scheda Fornitore: quindi appare automaticamente in entrambe. Nessun archivio nuovo.
- Il prezzo inserito dalla card entra nello storico prezzi come oggi (stessa regola già esistente).

## Cosa NON cambia
Quantità da acquistare, Conferma/Sblocca, card ocra, regole U.M. B2B e «Altra U.M.», conversioni, «Da assegnare», Inventario, Ordini, Consegne, Carico Merce.

## Dettagli tecnici
- Riuso della RPC esistente `manage_product_supplier_link` (già usata da product-suppliers-manager.tsx) e `set_preferred_product_supplier`, chiamate con la sessione dell'utente: autorizzazione decisa dal DB, nessun company_id dal browser.
- Nuovo componente `add-supplier-inline.tsx` usato da `card-suppliers.tsx`; dopo il salvataggio si ricaricano i dati della Lista.
- Nessuna migrazione prevista. Se la RPC non accettasse qualche campo necessario, mi fermo e te lo mostro prima.
