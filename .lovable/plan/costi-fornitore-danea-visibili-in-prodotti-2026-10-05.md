# Costi fornitore Danea visibili in Prodotti

## A. Nuova colonna «Costo Danea» (codice)
- In Vendite → Prodotti e Acquisti → Prodotti compare una colonna **«Costo Danea»** con il costo fornitore netto ricevuto dall'ultima importazione Danea (es. «€ 1,20»).
- Se Danea indica il fornitore, sotto il prezzo appare il suo nome; altrimenti «Fornitore non indicato».
- Danea non invia l'U.M. del prezzo: accanto al valore compare «U.M. prezzo non indicata», per non far credere che sia a kg o a cassetta.
- La colonna «Prezzo fornitore» (listino B2B) resta com'è: sono due informazioni diverse.
- La colonna nuova sarà visibile subito, anche con preferenze griglia già salvate.
- Nessuna modifica al database, all'importazione Danea, allo storico prezzi o agli acquisti.

## B. Completare i dati in Danea Easyfatt (a cura tua)
- In Easyfatt, nella scheda di ogni prodotto, compila **Fornitore** e **Cod. prodotto fornitore**.
- Al prossimo invio da Danea i costi si collegano al fornitore giusto ed entrano nello storico prezzi.
- Nell'app non serve fare nulla.

## Dettagli tecnici
- `products-workspace.tsx`: query in blocco su `product_supplier_costs` (product_id, supplier_name, supplier_net_price, received_at) filtrata per i prodotti caricati; aggiunta della colonna `danea_cost` alla definizione griglia.
- Pagina Vendite/Acquisti prodotti: `danea_cost` in `initialVisibleColumns`.
- Lettura con il client del browser: le regole di accesso esistenti limitano ai dati della propria azienda.
