# Impostazioni U.M.: acquisto nel tab Acquisto, vendita nel tab Vendita

## Cosa cambia (solo interfaccia)

Ho capito il malinteso: le "U.M. ordinabili" che ho spostato nel tab Acquisto sono in realtà i formati con cui **il cliente** ordina da noi. Quindi tornano al loro posto.

**Tab Vendita** (come può acquistare il cliente da noi):
- In vetrina B2B, disponibilità commerciale, U.M. del prezzo, listini (già presenti)
- Torna qui il blocco delle U.M. ordinabili dal cliente: quali formati sono attivi, quale è visibile, quale è predefinita, conversione verso l'U.M. base

**Tab Acquisto** (come acquistiamo noi dai fornitori):
- In cima resta "U.M. di acquisto": panoramica dei formati per fornitore (★ = predefinita)
- Subito sotto i fornitori con le loro referenze, dove ogni referenza ha già le proprie U.M. acquistabili modificabili (aggiungi, rimuovi, predefinita, conversione)
- Se il fornitore è un B2B registrato le U.M. arrivano dalla sua referenza; se è un fornitore esterno le impostiamo noi liberamente
- In fondo il costo ricevuto da Danea

Le due sezioni restano indipendenti: cambiare un formato di acquisto non cambia i formati di vendita e viceversa.

## Dettagli tecnici

- `src/components/products/product-detail-sheet.tsx`: `SalesUnitManager` (con `showPurchase={false}`) rimosso dal tab Acquisto e rimesso nel tab Vendita, sotto i listini; il tab Acquisto mantiene `PurchaseUnitsOverview` + `ProductSuppliersManager` + costo Danea.
- Nessuna modifica a database, RPC, RLS, permessi o logiche di calcolo. Nessun altro file toccato.
