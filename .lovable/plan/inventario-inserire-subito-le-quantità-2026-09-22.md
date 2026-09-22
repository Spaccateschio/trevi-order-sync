# Inventario: inserire subito le quantità

## Perché ora è diverso da prima

Le schede che vedi adesso sono **in sola lettura** perché l'app aspetta che tu prema "Nuovo conteggio". Prima la schermata con i campi e i pulsanti +1 +3 +5 +10 la vedevi perché era la vista di esempio, sempre "aperta". I campi non sono stati tolti: compaiono solo dentro un conteggio.

## A cosa servono le due sezioni

- **Conteggio** = quanta merce ho davvero in magazzino oggi (lo scrivi tu).
- **Fabbisogno** = quanto devo comprare, calcolato da solo: scorta minima meno quello che hai contato. Non si scrive nulla, si legge.

Non sono la stessa cosa, ma il secondo dipende dal primo: senza quantità inserite il fabbisogno resta vuoto.

## Cosa cambio

1. **Entri e scrivi, senza premere niente**: se non c'è un conteggio aperto, entrando in Inventario le schede sono già contabili — quantità calcolata, campo quantità fisica, differenza, Conferma, +1 +3 +5 +10. Al primo valore che confermi il conteggio si apre da solo sulle zone attive.
2. **Il messaggio "Nessun inventario generale aperto" sparisce** come blocco centrale; al suo posto una riga discreta: "Inventario non ancora avviato — scrivi le quantità, si apre da solo". Il pulsante "Nuovo conteggio" resta per chi vuole aprirlo a mano o ripartire.
3. **Nomi più chiari nelle due sezioni**: "Conteggio" → **Conteggio (cosa ho)**, "Fabbisogno" → **Fabbisogno (cosa comprare)**, con una riga di spiegazione in cima a ciascuna.
4. **Primo giorno**: i 6 prodotti della tua azienda compaiono già tutti con badge "Mai contato" e restano contabili; niente passaggi preliminari.

## Dettagli tecnici

- `inventory-count-panel.tsx`: il ramo senza `sessionId` riusa la stessa scheda contabile del ramo con sessione (stato locale delle bozze); alla prima conferma chiama la stessa RPC `manage_inventory_session` già usata dal pulsante "Nuovo conteggio", poi registra il conteggio con `record_inventory_count` e invalida le query.
- Nessuna modifica a database, RPC, permessi o formule di giacenza/fabbisogno.

## Fuori scope

Formule, FASE A/B/C/D, nuovo componente grafico condiviso dell'elenco prodotti.
