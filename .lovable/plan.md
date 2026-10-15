# Preparazione ordini e scarico unico in Danea — analisi e proposta

## Come funziona oggi (verificato, sola lettura)
- **Ordine B2B**: è un ordine del cliente (es. 3 EMME) con collegamento a Trevi Srl. Stati: bozza, inviato, parzialmente consegnato, consegnato, chiuso, annullato. Nessuno stato di preparazione.
- **Righe**: conservano quantità ordinata e U.M. (fotografate), prezzo e U.M. del prezzo, codice articolo. Nessun campo per la quantità preparata.
- **Blocco «visto»**: quando Trevi apre l'ordine, il cliente non può più modificarlo da solo (solo richieste di modifica, decise dal database). Lo riutilizziamo: preparare = aver visto.
- **Danea oggi**: scarica ogni ordine inviato appena arriva, una volta sola, con «Rimetti in scarico» per l'amministratore. Ci sono **2 ordini già scaricati** (incluso ORD-2026-00004): restano come sono.
- **Magazzini/zone**: esistono, ma sono legati ai prodotti di chi compra (inventario), non agli articoli che Trevi vende. Per la preparazione serve una zona sull'articolo di vendita di Trevi.

## Flusso proposto
```text
Cliente invia → Trevi vede in «Preparazione ordini» → righe preparate / non disponibili
→ «Preparazione completata» → scaricabile in Danea → scaricato una sola volta
```

## Blocco e sblocco dello scarico (tua richiesta)
Ogni ordine ha un interruttore **«Scarico in Danea: bloccato / sbloccato»**:
- Un ordine diventa sbloccato da solo con «Preparazione completata».
- Un responsabile può **bloccarlo** (es. preparazione da rivedere) o **sbloccarlo a mano** anche senza preparazione (es. ordine urgente da fatturare comunque, scaricato con le quantità ordinate e nota «non preparato»).
- Il preparatore può chiudere l'ordine; il responsabile può **riaprirlo** finché non è scaricato. Nessuna conferma obbligatoria del responsabile, come suggerisci.
- Dopo lo scarico non si riapre: si usa «Rimetti in scarico» come oggi.
- **Ordini vecchi** (arrivati prima di questa novità e non ancora scaricati): restano **sbloccati** come oggi, così non si fermano; quelli già scaricati non vengono toccati.

## Fase 1 — Pagina Preparazione (manuale)
- Operativo → Preparazione ordini: elenco ordini da preparare (cliente, consegna, avanzamento), apertura per zona.
- Riga: ordinato (3 cs) e preparato (12,400 kg + U.M.), stato Da preparare / In preparazione / Preparata / Non disponibile, chi e quando.
- Più preparatori: «prendo io» blocca la riga per qualche minuto; il database impedisce due conferme della stessa riga; la quantità ordinata non viene mai sovrascritta.
- «Preparazione completata» solo con tutte le righe gestite; «Riapri» per il responsabile.

## Fase 2 — Danea
- Scaricati solo ordini sbloccati e non ancora scaricati; nel file la quantità preparata e la sua U.M., l'ordinato nelle note; righe non disponibili escluse.
- **Prezzi**: il prezzo dell'ordine è sempre trattato come **indicativo**. Va nel file solo se l'U.M. del prezzo è uguale a quella preparata (es. €/kg con 12,400 kg); altrimenti niente prezzo e nota «Prezzo indicativo 2,50 €/cs – da definire». Mai zero. Il prezzo definitivo si fa in Danea. Listini non toccati.
- Tutto il resto resta: login postazioni, separazione aziende, controllo codici, storico, «Rimetti in scarico».

## Fase 3 — Assistente vocale AI
Conversazione a voce (telefono, tablet, auricolari, occhiali come microfono). Usa le stesse funzioni della Fase 1; salva solo dopo «confermo».

## Fase 4 — Occhiali con display
Solo dopo verifica di compatibilità.

## Cosa non tocco
Lista della Spesa, Inventario, ordini fornitori, consegne, carichi, listini, ordini già scaricati. Prove solo con dati finti annullati.

## Dettagli tecnici
- `purchase_orders`: `preparation_status` (null = ordine precedente / da_preparare / in_preparazione / completata), `prepared_at/by`, `danea_hold` (bool) + `danea_hold_by/at/reason`. Backfill: ordini esistenti `preparation_status = null` → trattati come oggi.
- Nuova `purchase_order_item_preparations` (1 per riga: status, prepared_quantity, prepared_unit_id+code fotografati, claimed_by/claimed_until, confirmed_by/at, not_available_reason) con RLS per l'azienda venditrice (relazione), GRANT, scrittura solo via RPC SECURITY DEFINER con FOR UPDATE: `prep_claim_line`, `prep_confirm_line`, `prep_mark_unavailable`, `prep_complete_order`, `prep_reopen_order`, `danea_set_order_hold` (admin). Audit in `purchase_order_changes`.
- Zona: `preparation_zone` sull'articolo di vendita del venditore (o tabella zone del venditore), facoltativa: senza zona → «Senza zona».
- `danea_orders_export_candidates`: aggiunge filtro `NOT danea_hold AND (preparation_status IS NULL OR = 'completata')` e restituisce quantità preparate; `danea-orders-xml.ts` usa preparato se presente.
- Nuove schermate: `operativo.preparazione.tsx` (+ dettaglio ordine); badge blocco in `received-orders-panel.tsx`.
- Da decidere: default del blocco per i nuovi ordini = bloccato fino a preparazione (proposto).
