# Ordini da inviare — schermata operativa (senza invio reale)

Non si implementano: invio B2B, WhatsApp, email, notifiche, PDF, conferma fornitore, dichiarazione di consegna. La Lista della Spesa non viene toccata.

## Cosa esiste già (riutilizzo)
- Ordine: `status` (bozza/inviato/…) e `send_status` (da_inviare/inviato/errore_invio) già separati; data, dalle, alle, indirizzo (id + testo) e note fornitore già salvati sull'ordine alla chiusura Lista.
- Indirizzi aziendali con funzioni (sede, consegna, magazzino) e impostazioni aziendali (`company_settings`, con fuso orario): si riusano, nessun duplicato.

## 1. Acquisti → Ordini
- Riquadro in evidenza **«Ordini da inviare — N»** (send_status = da_inviare e ordine non annullato).
- Card: fornitore, numero ORD, n. prodotti, «Consegna: Oggi · 01/10/2026», «06:00 – 09:00», indirizzo, badge **DA INVIARE**, pulsante «Visualizza ordine».
- Sotto: gruppi **Inviati** ed **Errore invio** (quest'ultimo visibile solo se esistono ordini in errore). Lo stato operativo (Bozza, Parzialmente consegnato…) resta mostrato a parte.

## 2. Dettaglio ordine
- Sezioni FORNITORE, CONSEGNA (data con Oggi/Domani, fascia, indirizzo), NOTE, PRODOTTI (quantità + U.M. d'acquisto; equivalente e prezzo solo se presenti).
- Se DA INVIARE: pulsante «Modifica consegna e note» → data (Oggi / Domani / Altra data, niente date passate), dalle/alle (controllo dalle < alle), destinazione (indirizzi aziendali o testo), note per il fornitore. Salva solo sull'ordine: la Lista LS resta com'è.
- Se INVIATO: tutto in sola lettura (regola già pronta per il futuro invio).

## 3. Preferenze di consegna (Impostazioni azienda)
- Nuova sezione «Preferenze di consegna»: destinazione predefinita (tra gli indirizzi aziendali), orario predefinito dalle/alle, data predefinita Oggi/Domani (salvata come scelta, non come data fissa; default Oggi).
- Solo gli amministratori dell'azienda possono modificarle.

## 4. Chiusura Lista — solo precompilazione
- Nella finestra di chiusura esistente: data con `[Oggi] [Domani] [Altra data]`, fascia e destinazione precompilate dalle preferenze. Oggi/Domani calcolati con il fuso dell'azienda (non UTC). Modifiche occasionali non cambiano le preferenze. Override per singolo fornitore invariato.
- Nessuna modifica alla logica di chiusura.

## Dettagli tecnici
- Migrazione: colonne su `company_settings`: `default_delivery_address_id uuid`, `default_delivery_time_from/to time`, `default_delivery_day text check in ('oggi','domani') default 'oggi'`.
- `manage_purchase_order`: nuova azione `delivery` (data, dalle, alle, indirizzo id/testo, note fornitore), consentita solo con send_status = da_inviare e status = bozza; rifiuta date passate (fuso azienda) e dalle ≥ alle. Le note dopo l'invio diventano non modificabili (oggi lo sono).
- RPC `manage_company_delivery_preferences` (SECURITY DEFINER, search_path public, verifica is_company_admin).
- `purchase_order_overview`: aggiungere send_status, campi consegna e n. prodotti.
- UI: `purchase-orders-panel.tsx`, `purchase-order-detail.tsx`, nuovo componente preferenze in Impostazioni, `close-list-dialog.tsx` (solo precompilazione/selettore data).
- Verifica: prove in transazione annullata (modifica ordine, Lista invariata, rifiuto dopo invio) e controllo a schermo dei punti 1–8.
