# Inventario modificabile + Lista «Da controllare» + banner ordini inviati

## Cosa vedrai

**1. Inventario (semaforo rosso, Lista non ancora chiusa)**
- «Modifica conteggio»: riapre l'ultimo conteggio confermato con le quantità già inserite; correggi e riconfermi.
- «Azzera quantità»: chiede «Vuoi davvero ripartire da zero?» e poi svuota tutte le card.
- I due pulsanti non compaiono quando gli ordini della Lista sono già stati inviati.

**2. Lista della Spesa dopo una modifica all'inventario**
- La Lista non si perde.
- Si sbloccano solo le card dei prodotti con un numero cambiato. Hanno il bordo arancione e la scritta «Inventario cambiato: prima 5, ora 8».
- Il filtro si apre su «Da controllare (N)» invece che su «★ Preferiti». Quando le hai riconfermate tutte, torna da solo su Preferiti.
- Puoi comunque sbloccare qualsiasi card con «Sblocca», come oggi.
- Le card di un ordine già inviato non si sbloccano. Compare l'avviso «Ordine già inviato: chiama il fornitore».
- Il semaforo resta rosso finché ci sono card da controllare.

**4. Unità di misura libera in inventario (es. vino: casse e bottiglie)**
- In ogni card dell'inventario puoi cambiare l'unità di misura a piacere per quel conteggio (bottiglia, cassa, pezzo...), come già fai nella Lista della Spesa.
- Se l'acquisto avviene a casse da 6 bottiglie e conti a bottiglie, la card mostra anche il **resto**: «21 bottiglie = 3 casse piene + 3 bottiglie». Così chi ordina capisce subito che restano 3 bottiglie sfuse.
- Nella Lista della Spesa la stessa riga mostra «3 casse + 3 bottiglie» accanto alla quantità da ordinare, così chi ordina vede i quantitativi esatti.
- Il resto si calcola solo quando la conversione è certa (cassa = 6 bottiglie dichiarate); altrimenti compare solo il numero contato, senza inventare conversioni.

**3. Invio degli ordini della Lista**
- Quando sono partiti tutti gli ordini, Inventario e Lista della Spesa ripartono puliti: card vuote, «Nessuna lista in corso». Lo storico resta intatto.
- In alto compare **un solo banner** sottile che scorre: «Ordine ORD-2026-000XX inviato a FORNITORE». Mostra solo l'ultimo ordine, così non copre lo schermo.
- Se gli ordini sono più di uno, a destra compare una freccia «+N». Tocchi la freccia e si apre un piccolo elenco a tendina con tutti gli altri. Lo richiudi con la stessa freccia.
- Tocchi il banner, o una riga dell'elenco, e vai a quell'ordine. Il banner ha una ✕ per chiuderlo e sparisce da solo dopo qualche ora.

## Dettagli tecnici
- Migrazione: colonne nullable su shopping_list_items `inventory_changed_at` e `inventory_previous_quantity`. RPC `reopen_inventory_count(_session_id)` e `reset_inventory_count(_session_id)` (SECURITY DEFINER, search_path=public, autorizzazione tramite membro dell'azienda). Entrambe sono rifiutate se esiste un ordine non in bozza nato dalla Lista del ciclo.
- Alla riconferma del conteggio, per ogni prodotto con quantità diversa e riga in Lista non ancora ordinata: azzera `quantity_locked_at` e valorizza i due campi. `confirm_shopping_list_product` li ripulisce.
- Il semaforo (`inventory_purchase_cycle_status`) considera le righe con `inventory_changed_at` come «da gestire». La modifica è minima e non cambia le altre regole.
- Il reset dopo l'invio si appoggia alla regola già esistente: con il ciclo non rosso, le pagine operative mostrano solo il lavoro corrente. Verifico che l'invio dell'ultimo ordine chiuda la Lista (stato chiusa) e chiuda la valutazione.
- Banner: nuovo componente `sent-orders-banner.tsx` (una sola riga marquee con token del tema, Link all'ordine più recente, freccia con Collapsible shadcn per gli altri ordini) nelle pagine Inventario, Lista e Ordini. Legge gli ordini inviati nelle ultime ore dalla Lista chiusa; la chiusura con ✕ resta salvata sul dispositivo.
- File: inventory-count-panel.tsx, componenti della Lista (card + filtro), nuovo banner, una migrazione. Non tocco Consegne, Carico Merce e Danea.
- Test: prova su 3 EMME (modifica 1 quantità → solo quella card risulta da controllare; invio ordini → pagine pulite + banner).
