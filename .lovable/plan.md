# Card dei prodotti con fornitore B2B — risposte e piano

Il piano precedente sulle unità di misura è annullato e non verrà implementato.

## Risposte (sola lettura)

**1. Da dove si capisce che c'è un fornitore B2B**
- Tabella `product_supplier_links`, collegamento con `is_active = true` e `b2b_item_id` non vuoto (insieme a `supplier_company_id`). Questa è l'identità B2B ufficiale del collegamento (regola già esistente).
- Il codice articolo da solo o l'origine «copiato dal catalogo» (`products.created_from_product_id`) non bastano e non vanno usati.
- Nota: «collegato» non vuol dire «acquistabile oggi». Il colore segnerà il collegamento, non l'acquistabilità.

**2. Il dato è già letto?**
- Lista della Spesa (card in lista): sì, già presente nella lettura unica `shopping_list_cards_bundle` (indicazione `is_b2b` per ogni fornitore). Nessuna lettura in più.
- Lista, prodotti del catalogo non ancora in lista, e Inventario: no. L'Inventario legge già i collegamenti attivi in una sola richiesta per pagina (`inventory-count-panel.tsx`), ma senza `b2b_item_id`. Basta aggiungere quel campo alla richiesta esistente: nessuna richiesta nuova e nessuna per card. Per i prodotti del catalogo in Lista serve la stessa cosa: una sola richiesta per la pagina.

**3. Colori di stato già presenti**
- Verde (success): quantità assegnata / confermata.
- Rosso (destructive): errori e blocchi.
- Ocra (warning, uguale al giallo del tema): da completare, U.M. da scegliere, avvisi, e i **mancanti** nel Carrello e in «Cosa confermi» (sfondo ocra).
- Blu notte (primary): card aperta / selezionata.
- **Rischio da segnalare:** il giallo ocra è già il colore dei mancanti e degli avvisi. Uno sfondo ocra per il B2B si confonderebbe con «manca la quantità», soprattutto nel Carrello.

## Proposta (dopo il tuo via libera)

- Sfondo giallo ocra **molto chiaro**, nuovo colore dedicato «B2B» (più tenue dell'ocra dei mancanti), con una piccola etichetta «B2B» sulla card per non dipendere solo dal colore.
- Gli stati restano su bordo e badge (verde, rosso, ocra pieno).
- Lista (vista Card e Righe), Inventario, Carrello e «Cosa confermi».
- Nei mancanti del Carrello/«Cosa confermi» lo sfondo ocra resta ai mancanti; il B2B lì si vede con l'etichetta, per non confondere.
- Legenda piccola vicino ai filtri: «Giallo = fornitore B2B».
- Tema chiaro e scuro con contrasto verificato.
- Nessuna modifica a database, ciclo o salvataggio; nessuna chiamata per card.

Se preferisci un altro colore di sfondo (per esempio azzurro chiaro) per evitare la confusione con i mancanti, dimmelo prima del via libera. Il file delle attività lo aggiorno appena approvi.
