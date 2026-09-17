# Punto 2 — Griglia Prodotti professionale

## Obiettivo
Trasformare Vendite → Prodotti in una schermata operativa compatta, mantenendo tutti i dati Danea in sola lettura e lasciando invariati archivi, importazione, listini e futura gestione U.M.

## Intervento
1. **Preferenze personali della griglia**
   - Creare `user_grid_preferences` con preferenze per utente, chiave griglia e dispositivo (`desktop`, `tablet`, `smartphone`).
   - Salvare visibilità, ordine, larghezze e ordinamento delle colonne; aggiungere ripristino delle impostazioni iniziali.
   - Proteggere ogni riga affinché sia leggibile e modificabile soltanto dal relativo utente.

2. **Griglia desktop e tablet**
   - Usare TanStack Table per ordinamento tipizzato, selezione, visibilità, ordine e ridimensionamento.
   - Cinque colonne iniziali: Codice, Descrizione, Categoria, U.M. Danea, Listino 1.
   - Menu Colonne con caselle per tutti i campi realmente presenti; nessuna Giacenza e nessun dato inventato.
   - Riordino trascinando le intestazioni, ridimensionamento dal bordo, intestazione fissa e righe dense.
   - Filtri e comandi raccolti in un’unica barra compatta immediatamente sopra la griglia.
   - Selezione singola, multipla e di tutto il risultato filtrato.

3. **Smartphone e dettaglio prodotto**
   - Su smartphone sostituire la griglia larga con un elenco touch compatto, mantenendo ricerca, filtri e selezione.
   - Aprire il dettaglio in un pannello laterale su desktop/tablet e a tutto schermo su smartphone.
   - Mostrare soltanto i dati Danea in lettura; nessuna U.M. Trevi Fruit, conversione o immagine in questa fase.

4. **Stampa ed esportazione**
   - Stampare i prodotti selezionati con le colonne visibili nello stesso ordine, in formato A4; se non c’è selezione, stampare il risultato filtrato.
   - Esportare CSV compatibile con Excel, separatore `;` e codifica corretta; selezionati se presenti, altrimenti risultato filtrato.
   - Escludere dai file e dalla stampa la colonna tecnica di selezione.

5. **Compattezza della pagina**
   - Ridurre soltanto per Prodotti lo spazio occupato dal titolo e portare subito filtri e tabella nella prima schermata.
   - Conservare il tema e i componenti esistenti.

## File previsti
- `src/routes/_authenticated/vendite_.prodotti.tsx`: dati, filtri, selezione, stampa/esportazione e composizione della pagina.
- `src/components/products/product-grid.tsx`: griglia desktop/tablet.
- `src/components/products/product-mobile-list.tsx`: elenco smartphone.
- `src/components/products/product-detail-sheet.tsx`: dettaglio laterale/a tutto schermo.
- `src/lib/product-grid.ts`: definizioni delle colonne, valori esportabili e impostazioni iniziali.
- `src/components/app-shell.tsx`: sola opzione di intestazione compatta, usata da Prodotti.
- `src/styles.css`: sole regole di stampa A4 della griglia.
- `package.json` e lockfile: TanStack Table; virtualizzazione solo se necessaria per dataset ampi.
- Migrazione backend: sola tabella `user_grid_preferences` con permessi e protezioni per utente.
- `roadmap.md`: chiusura del Punto 1 e avanzamento del Punto 2.

## Verifiche prima di fermarmi
- Desktop: cinque colonne iniziali, mostra/nascondi, riordino, ridimensionamento, ordinamento, selezione e intestazione fissa.
- Persistenza: uscita/rientro e ricarica mantengono le preferenze; desktop e smartphone restano separati; ripristino funziona.
- Filtri: ricerca, categoria, archivio e stato combinabili senza perdere la selezione valida.
- Stampa e CSV: colonne visibili nello stesso ordine; selezione prioritaria, altrimenti tutti i filtrati.
- Tablet e smartphone: nessuna griglia compressa sul telefono, controlli utilizzabili al tocco, dettaglio a tutto schermo.
- Sicurezza: un utente non può leggere o modificare preferenze altrui.
- Regressione: importazione manuale, endpoint diretto, archivi, prodotti e listini invariati; compilazione e registri senza errori.

Al termine mi fermo con il report del Punto 2, senza iniziare U.M., immagini, Inventario o Ordina.
