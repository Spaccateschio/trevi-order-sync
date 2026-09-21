# Prodotti propri, prodotti manuali, Preferiti e Inventario — analisi e proposta

Nessuna modifica eseguita: sotto ci sono le risposte alle otto domande, verificate sul database e sul codice attuale, e la proposta.

## A. Risposte alla verifica

**1. Come vengono identificati oggi i prodotti Danea**
L'identità è la coppia archivio + codice, con l'InternalID Danea come chiave preferita: esistono due vincoli di unicità, uno su (azienda, archivio, codice) e uno su (azienda, archivio, InternalID). L'importazione cerca prima per InternalID, allinea il codice se è cambiato, poi scrive in blocco usando come chiave (azienda, archivio, codice).

**2. Possiamo già creare prodotti manuali?**
Strutturalmente quasi: il prodotto ha già descrizione, categoria, sottocategoria, U.M., note, barcode, produttore, IVA, immagini, unità di vendita, prezzi. Mancano due cose:
- il prodotto richiede obbligatoriamente un archivio Danea, quindi un'azienda senza Danea oggi non può avere prodotti;
- non esiste alcun campo che dica "questo prodotto è stato creato a mano": non c'è nessuna colonna di origine. E nell'app non esiste nessuna schermata di creazione prodotto (nessun "Nuovo prodotto").

**3. Collisione fra codice manuale e codice Danea — il rischio è reale**
Confermato: se un prodotto manuale vivesse nello stesso archivio dei prodotti Danea, un'importazione con lo stesso codice lo sovrascriverebbe, e un invio completo lo depubblicherebbe perché "assente dal file". L'attuale identità archivio+codice NON è sufficiente. Serve una separazione esplicita (proposta al punto 1 sotto).

**4. Perché l'Inventario è oggi riservato a chi compra**
È un semplice blocco di schermata: la pagina Inventario controlla il profilo di acquisto e, se assente, mostra il messaggio. Il database non ha questo limite. Si corregge solo lato interfaccia.

**5. Quali prodotti entrano oggi nella fotografia dell'inventario**
All'apertura vengono inseriti tutti i prodotti pubblicati dell'azienda per quell'archivio, abbinati alle zone dove il prodotto risulta già presente (conteggi chiusi, rettifiche, movimenti, lotti) e, se non risulta da nessuna parte, alla zona predefinita. Nessun prodotto di altre aziende, quindi oggi i Preferiti di catalogo non entrano.

**6. Preferiti B2B → insieme inventariabile, senza duplicare**
I Preferiti di catalogo sono già registrati con acquirente + fornitore + prodotto, e puntano al prodotto reale del fornitore. Quindi si possono aggiungere alla fotografia dell'inventario senza creare copie: si aggiunge alla fotografia il riferimento al prodotto del fornitore più il fornitore di provenienza. Nessuna fusione per codice o descrizione simile.

**7. Se un Preferito viene tolto a inventario aperto**
Nessun effetto sull'inventario in corso: la fotografia viene scritta una volta sola all'apertura e, se esiste già, l'apertura la restituisce senza toccarla. Un inventario aperto con 50 righe resta a 50; un Preferito aggiunto o rimosso dopo conta solo dal prossimo inventario. Questo principio resta invariato.

**8. Cosa serve davvero**
Tre interventi mirati, elencati sotto.

## B. Proposta

**1. Origine del prodotto e archivio interno (database)**
- Nuova colonna di origine sul prodotto: `manuale` o `danea`, con valore `danea` per tutto l'esistente.
- Ogni azienda ottiene un archivio interno dedicato "Prodotti propri", creato automaticamente al bisogno e non utilizzabile dalle postazioni Danea. I prodotti manuali vivono lì: i codici manuali non possono più incrociare quelli Danea, nemmeno per errore.
- L'importazione Danea (completa e incrementale) viene limitata ai prodotti di origine `danea`: nessun prodotto manuale può essere modificato o depubblicato da una sincronizzazione. Restano invariate le regole già approvate sull'allineamento Danea.
- Funzione di creazione/modifica prodotto manuale con proposta automatica del prossimo codice (`00-001`, `00-002`, …) e possibilità di scriverne uno diverso, anche alfanumerico, con controllo di unicità.

**2. Nuovo prodotto nella pagina Prodotti (interfaccia)**
Pulsante "Nuovo prodotto" con scheda: codice (precompilato), descrizione, categoria, sottocategoria, U.M., produttore, note, barcode. Immagini e unità di vendita si gestiscono con le schermate già esistenti dopo il salvataggio. I prodotti manuali sono riconoscibili nell'elenco. Danea resta una fonte di importazione, non un requisito.

**3. Inventario: chi può farlo e cosa contiene**
- Rimozione del blocco sul profilo di acquisto: anche un'azienda che vende (Trevi) fa inventario sui propri prodotti.
- L'apertura non richiede più un archivio Danea: in assenza, si usa l'archivio interno dei prodotti propri.
- La fotografia dell'inventario diventa: prodotti propri (Danea + manuali) **più** i prodotti messi tra i Preferiti nei cataloghi dei fornitori collegati. Ogni riga porta con sé il fornitore di provenienza, così prodotti di fornitori diversi restano distinti anche con codici o descrizioni simili. I prodotti di catalogo non preferiti non entrano.
- Le righe dell'inventario mostrano il fornitore di provenienza; giacenza, conteggi, rettifiche, differenze, note e chiusura restano esattamente come oggi.

**4. Cosa non viene toccato**
Formule di giacenza, Fabbisogno, Lista della Spesa, Ordini fornitore, ricevute, lotti, provenienza, listini, immagini, permessi, route, layout approvati (inventario e card mobile).

## C. Dettagli tecnici

- `products`: nuova colonna `origin` (enum `product_origin`: `danea`, `manuale`), default `danea`, backfill dell'esistente; nuovo indice unico parziale su (company_id, code) per i soli prodotti manuali.
- `danea_archives`: flag `is_internal` per l'archivio "Prodotti propri"; funzione `ensure_internal_archive(company_id)`; `danea_stations` non può puntare a un archivio interno (guard esistente estesa).
- `danea-import.server.ts`: filtri `origin = 'danea'` su lettura esistenti, upsert, depubblicazione per assenza e depubblicazione da DeletedProducts; nessuna altra modifica alla logica di sincronizzazione.
- Nuove RPC `manage_manual_product` e `next_manual_product_code` (SECURITY DEFINER, `search_path = public`, solo amministratori dell'azienda).
- `inventory_session_products`: nuova colonna `source_seller_company_id` (nullable = prodotto proprio); chiave unica estesa a (session_id, product_id, location_id, source_seller_company_id).
- `start_general_inventory`: archivio opzionale; la CTE dei prodotti diventa unione fra prodotti propri pubblicati e prodotti dei `buyer_product_favorites` con rapporto B2B operativo; invariata la scrittura una-sola-volta della fotografia.
- `inventory_session_rows` / `inventory_session_progress`: restituiscono il fornitore di provenienza; aggregazioni per zona/categoria/sottocategoria calcolate sulle stesse righe della fotografia.
- `record_inventory_count` e `close_general_inventory`: nessun cambio di formula, solo compatibilità con la chiave estesa.
- Test finali: creazione prodotto manuale senza Danea; importazione completa che non tocca né depubblica i manuali; codice manuale uguale a uno Danea senza collisione; inventario aperto da azienda solo-vendita; fotografia = propri + preferiti di più fornitori senza duplicati; aggiunta/rimozione preferito a inventario aperto che non cambia il totale; refresh e rientro sulla stessa sessione; nessuna regressione su Fabbisogno, Lista della Spesa, Ordini, Danea.
