# Colore pastello per fornitore — risposte e piano

Sostituisce il piano delle card gialle per il B2B (annullato) e quello sulle unità di misura (annullato).

## Risposte (sola lettura)

**1. Dove sono i fornitori e quale chiave usare**
- Ogni fornitore, B2B o manuale, ha la sua anagrafica nell'azienda che compra: `supplier_records` (azienda = `buyer_company_id`, nome = `legal_name`).
- Fornitore B2B: la stessa anagrafica è collegata all'azienda venditrice tramite `supplier_customer_relations.supplier_record_id` (venditore = `seller_company_id` in `companies`).
- Ogni prodotto si collega al fornitore con `product_supplier_links.supplier_record_id`.
- Chiave stabile del colore: **`supplier_records.id`**. Vale per B2B e manuali ed è già propria di ogni azienda, quindi due aziende possono scegliere colori diversi per lo stesso fornitore.

**2. Dove salvare il colore**
- Nessuna tabella nuova: un campo in `supplier_records`, nome `display_color` (testo, solo uno dei codici della tavolozza, es. `p03`; vuoto = colore automatico).
- Relazione: già 1 riga per azienda e fornitore (`buyer_company_id`).
- Accesso già esistente: lettura per i membri dell'azienda, modifica solo agli amministratori (`is_company_admin`). Nessuna nuova policy.

**3. Fornitore principale di una card oggi**
- Prima della quantità: stella (`product_supplier_links.is_preferred`); senza stella, l'unico fornitore valido; poi la memoria dell'ultima Lista chiusa (`chooseListDestinations`).
- Con quantità: le quote in `shopping_list_item_suppliers` (righe con `deselected_at` vuoto).
- Card divisa tra più fornitori: oggi un elenco di righe fornitore con spunta e quota ciascuna dentro la card; nessun colore.
- Proposta di principale: quota più alta; a parità o senza quote, la stella; altrimenti il primo in elenco.

**4. Colori di stato da escludere**
- Verde: assegnato / confermato. Rosso: errori e blocchi. Ocra: avvisi, U.M. da scegliere, mancanti (sfondo nel Carrello e in «Cosa confermi»). Blu notte: card aperta / selezionata.

**5. Dati già letti**
- Lista della Spesa: fornitori e quote già nella lettura unica della pagina; manca solo il colore → si aggiunge `display_color` alla lettura dei fornitori già esistente.
- Inventario: già legge una volta per pagina i collegamenti attivi con il nome del fornitore; si aggiungono `supplier_record_id` e `display_color` a quella richiesta.
- Carrello e «Cosa confermi»: usano i dati già caricati dalla pagina.
- Ordini: il fornitore è già nella testata dell'ordine; si aggiunge il colore alla stessa lettura.
- Nessuna richiesta per card.

## Piano (dopo il tuo via libera)

1. **Tavolozza** di 12 pastello (azzurro, celeste, lavanda, lilla, rosa, pesca, sabbia, acqua, turchese, pervinca, grigio-blu, malva), senza rosso, verde e ocra. Ognuno ha una versione chiara e una scura, con testo leggibile in entrambi i temi.
2. **Colore automatico e stabile**: calcolato dall'identificatore del fornitore, quindi sempre lo stesso senza salvare nulla. Se l'amministratore lo cambia nella scheda fornitore, vale la scelta salvata.
3. **Scheda fornitore**: piccola scelta tra i 12 colori con anteprima.
4. **Card** (Lista Card e Righe, Inventario, Carrello, «Cosa confermi», Ordini): tinta leggera del fornitore principale, fascia a sinistra e nome del fornitore. Più fornitori: fasce affiancate, tinta del principale.
5. Gli stati restano solo su bordo e badge; nei mancanti del Carrello lo sfondo ocra resta ai mancanti e il fornitore si vede dalla fascia.
6. **Legenda** vicino ai filtri con i fornitori della pagina; toccandone uno si filtrano le card di quel fornitore (filtro solo a schermo, non salvato).

## Modifica al database (descritta, da non eseguire senza via libera)

- Migrazione: aggiunge `supplier_records.display_color text` facoltativo, con controllo che accetti solo i 12 codici della tavolozza o vuoto.
- RLS e permessi invariati (già attivi). Nessuna modifica a ciclo, quantità, ordini o salvataggi.
- Nessun dato esistente da correggere: il colore automatico funziona anche con il campo vuoto.

## Dettagli tecnici
- Funzione pura per tavolozza e colore automatico, con test.
- Colori come token in `src/styles.css`, nessun colore fisso nei componenti.
- Il file delle attività verrà aggiornato appena approvi.
