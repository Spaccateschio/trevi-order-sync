# Ordini cliente: stato chiaro, cestino, lucchetto e notifiche vecchie

## 1. Stato chiaro lato cliente (3 EMME, «Ordini fornitore»)
- Oggi l'ordine annullato mostra insieme «INVIATO» e «Annullato»: confonde.
- Un'unica etichetta per ordine: **Da inviare**, **Inviato – in attesa**, **Visto dal fornitore** (con lucchetto), **Chiuso**, **Annullato** (rossa, card grigia).

## 2. Cestino rosso e modifica (solo se il fornitore non ha ancora aperto l'ordine)
- Sulla card dell'ordine inviato: pulsante **cestino rosso** → conferma «Annullare l'ordine ORD-…?» → l'ordine diventa Annullato (resta nello storico, non si cancella) e Trevi riceve la notifica «Ordine annullato».
- Pulsante **Modifica**: cambiare quantità, togliere righe, cambiare data/orario/luogo di consegna. Trevi riceve la notifica «Ordine modificato».

## 3. Lucchetto quando il fornitore apre l'ordine
- La prima volta che un utente Trevi apre l'ordine in «Ordini clienti», l'ordine viene segnato come **visto** (data, ora, chi).
- Da quel momento, lato cliente: **lucchetto**, niente cestino né Modifica, scritta «Il fornitore ha già preso in carico l'ordine: per annullare o modificare chiama il fornitore».
- Il blocco è controllato dal database, non solo dai pulsanti.

## 4. Campanella vuota
- Motivo: le notifiche nascono solo per eventi avvenuti dopo la creazione della campanella; i 2 ordini di 3 EMME sono del 26/09 e 30/09.
- Creo una volta le notifiche storiche per gli ordini già esistenti (nuovo ordine e annullamento), così compaiono nello «Storico».
- Aggiungo la notifica «Ordine modificato».

## Dettagli tecnici
- Migrazione: colonne `seen_by_supplier_at` / `seen_by_supplier_by` su `purchase_orders`; RPC `mark_order_seen_by_supplier` (solo membri del venditore), `customer_cancel_order` e `customer_update_order` (solo azienda acquirente, solo se non visto e stato inviato); trigger notifiche esteso a «modificato».
- Notifiche storiche inserite una volta tramite query dati.
- File: `purchase-orders-panel.tsx` (lato cliente), `received-orders-panel.tsx` (segna visto all'apertura).
- Non tocco Lista della Spesa, Inventario, semaforo, Consegne, Carico Merce.
