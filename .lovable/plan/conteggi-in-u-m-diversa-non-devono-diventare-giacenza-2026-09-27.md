# Conteggi in U.M. diversa: non devono diventare giacenza

## Problema (confermato)
Se un prodotto con giacenza in "pz" viene contato come "3 cs", alla chiusura dell'inventario quel 3 diventa la giacenza "3 pz". Il Fabbisogno quindi mostra una disponibilità sbagliata e propone quantità d'ordine sbagliate. Oggi l'U.M. diversa blocca solo il confronto, ma non impedisce che quel numero diventi giacenza.

## Regola proposta (nessuna conversione, come deciso)
- Un conteggio in U.M. diversa resta **valido e salvato nello storico**, conta per completare l'inventario e appare come "U.M. non confrontabili", come oggi.
- **Non diventa però giacenza.** Per la giacenza vale l'ultimo conteggio fatto **nella stessa U.M. della giacenza**. Se non ce n'è nessuno, il prodotto resta "mai contato" (quantità sconosciuta, mai 0).
- Nel Fabbisogno quel prodotto resta con il promemoria "Ultimo conteggio: 3 cs", già presente.

## Cosa cambia
- Solo il calcolo della giacenza nel database (una funzione): scarta i conteggi con U.M. diversa da quella del prodotto.
- Nessuna modifica a menu delle U.M., schermate, formule del Fabbisogno, Lista della Spesa o storico.

## Dettagli tecnici
- `inventory_location_stock`: aggiungere a `last_count` un JOIN su `products` e la condizione `coalesce(trim(c.unit_code),'') = '' OR lower(trim(c.unit_code)) = lower(trim(p.danea_um))`, con lo stesso criterio di `units_comparable`. Mantenere SECURITY DEFINER, search_path=public e EXECUTE solo per service_role (I2).
- Prove in transazione annullata: conteggio 20 pz → giacenza 20; conteggio successivo 3 cs → giacenza resta 20; solo conteggio in cs → "mai contato"; Fabbisogno e Inventario si aprono senza errori.
