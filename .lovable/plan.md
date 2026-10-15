# Preparazione ordini con assistente vocale AI

## Obiettivo
Pagina «Preparazione ordini» (in Operativo) dove più preparatori lavorano insieme e parlano con un'assistente AI: «Aprimi l'ordine di 3 EMME», «Dettami le prime tre voci del magazzino uno», «Peso 3,100 kg» → l'AI ripete «Aglio 3,100 kg, confermi?» → «Confermo» → salvato. Il peso confermato entra nell'ordine che Danea scarica.

## Un punto da decidere prima (rischio)
Oggi Danea può scaricare un ordine appena il cliente lo invia, cioè **prima** della preparazione: in quel caso non conterrebbe i pesi. Proposta: un ordine B2B diventa scaricabile da Danea **solo quando la preparazione è chiusa** («Preparazione completata»). Così in Danea arrivano sempre i pesi reali. Serve la tua conferma, perché cambia quando Danea vede gli ordini.

## Fasi (una alla volta, ognuna con tua approvazione)

**Fase 1 — Preparazione da telefono, senza AI**
- Elenco ordini ricevuti da preparare; apertura ordine con righe raggruppate per magazzino/zona.
- Per ogni riga: quantità ordinata (es. 3 teste) e campo «quantità preparata» (es. 3,100 kg), con conferma esplicita.
- Più preparatori: ogni riga mostra chi la sta preparando; due persone non possono confermare la stessa riga (deciso dal database). Ogni pesata registra chi e quando.
- Pulsante «Preparazione completata».

**Fase 2 — Pesi nell'ordine Danea**
- Il file per Danea usa la quantità preparata e l'U.M. effettiva al posto di quella ordinata (nessuna conversione inventata); la quantità ordinata resta nelle note di riga.
- Applico la regola sopra (scaricabile solo a preparazione completata), se approvata.

**Fase 3 — Assistente AI a voce**
- Pulsante «Parla con l'assistente»: conversazione vera, a voce, dal telefono (o occhiali/auricolari come microfono e cuffia).
- L'AI può solo: cercare e aprire ordini, leggere righe per magazzino, proporre un peso. Il salvataggio avviene solo dopo «confermo» ed è lo stesso salvataggio della Fase 1 (stessi controlli, nessuna scorciatoia).
- Lo schermo segue la conversazione (riga attiva evidenziata).

## Costi e limiti
- L'AI vocale consuma crediti Lovable AI a ogni minuto di conversazione.
- Occhiali con display: per ora solo come microfono/cuffia; la pagina sarà pronta se Meta aprirà il browser.

## Cosa non tocco
Lista della Spesa, Inventario, Ordini fornitori, Consegne, Carichi, semaforo. Nessun ordine reale modificato durante le prove.

## Dettagli tecnici
- Nuova tabella righe preparazione (company_id, order_line_id, prepared_quantity, unit_id, prepared_by, confirmed_at, lock_by/lock_until) con RLS sull'azienda venditrice; scrittura solo via RPC SECURITY DEFINER con FOR UPDATE.
- Fase 2: `danea_orders_export_candidates` filtra per preparazione completata; `danea-orders-xml.ts` usa la quantità preparata.
- Fase 3: GPT Live tramite AI Gateway con delega al server: gli strumenti dell'AI chiamano le stesse RPC con l'utente autenticato.
