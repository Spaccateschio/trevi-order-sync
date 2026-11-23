# Carrello → ordini per fornitore → invio uno per volta

## Cosa vedrai
1. **Carrello**: in alto i prodotti **Mancanti** (sfondo ocra), sotto quelli **con quantità**. Le righe restano divise per fornitore, con i colori che hai già impostato.
2. **Conferma modifiche**: salva come oggi. Poi si apre da sola la finestra **Ordini per fornitore**, come nella tua immagine: una riga per fornitore, con il numero di prodotti.
3. **Tocchi un fornitore** e la riga si apre. Dentro trovi:
   - i prodotti con le quantità e le U.M. che hai impostato;
   - un campo **Note per il fornitore**;
   - il **giorno e l'orario di consegna**, già compilati con quelli impostati per quel fornitore;
   - una **matita** per cambiare quantità, giorno o orario prima dell'invio.
4. **Aeroplanino** su ogni fornitore: genera l'ordine e apre la scelta di invio, uguale alla tua terza immagine:
   - WhatsApp;
   - Email;
   - Copia link;
   - Scarica PDF;
   - Stampa.

   Il link porta alla nostra pagina, dove il fornitore compila e conferma senza registrarsi. La risposta torna nell'app, come succede già oggi.
5. **Dopo l'invio** la riga diventa **verde pastello** con la scritta «Inviato». L'aeroplanino resta attivo per **rinviare** lo stesso ordine, senza crearne uno nuovo.
6. I fornitori B2B (es. trevi) seguono lo stesso schema: l'aeroplanino invia l'ordine dentro l'app.

## Cosa non cambia
- Nessuna modifica al database, al ciclo della Lista, alle quantità salvate o al modo di dividere per fornitore.
- Niente prezzi in euro sugli ordini (regola esistente).
- Ordine stampato su carta dal fornitore: per ora nessun ritorno automatico, come hai detto.

## Dettagli tecnici
- `entry-cart-dock.tsx`: sezione Mancanti spostata prima di Inseriti/Confermati, solo ordine di presentazione.
- Dopo il Conferma riuscito del Carrello si apre l'esistente `GenerateOrdersDialog`. Ogni card fornitore riusa la generazione idempotente `generate_supplier_order` e la modifica `update_draft_order` (matita, note, orario da `deliveryDefaults`).
- L'aeroplanino riusa il flusso esistente: `confirm_non_b2b_order_share` per i fornitori esterni, `manage_purchase_order(send)` per i B2B, e la stessa `OrderShareDialog`. Il verde «Inviato» si legge dallo stato d'invio già salvato; il rinvio usa la modalità resend.
- Si toccano solo `entry-cart-dock.tsx`, `shopping-list-panel.tsx` (apertura dopo il Conferma) e `generate-orders-dialog.tsx` (layout a righe espandibili, aeroplanino, stato verde). Test sull'ordine Mancanti→Inseriti e sullo stato Inviato/Rinvia.
- Verifica su 3 EMME, telefono, senza invii reali.
