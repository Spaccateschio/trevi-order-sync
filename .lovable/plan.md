# Inventario: workspace unico, Preferiti sulle schede e filtri compatti

## Verifica effettuata

Le due esperienze sono generate nello stesso file, ma da due rami distinti:

- **Prima del conteggio**: `InventoryCountPanel` usa `DraftCountCard`, con una barra ridotta Preferiti/Tutti/Cerca e una lista separata per gli articoli dei cataloghi.
- **Dopo la prima conferma**: `InventoryCountPanel` usa `PhysicalCount` e `ProductCard`, con avanzamento, stati, azioni, Filtri e Colonne.
- La barra duplicata Zone/Categorie/Sottocategorie/Prodotti/Cerca è interna a `PhysicalCount`, oltre al menu Filtri già presente.

Questa separazione spiega il cambio improvviso di interfaccia all’apertura automatica della sessione.

## Preferiti: comportamento corretto

Per rendere preferito un articolo del Catalogo **non è tecnicamente necessario adottarlo nei prodotti propri**. Oggi la funzione generale del Catalogo abbina le due azioni, ma nell’Inventario le separeremo:

- articolo del Catalogo: la stella salva/toglie il preferito direttamente sulla referenza del fornitore;
- prodotto proprio collegato a un fornitore: la stella legge e aggiorna lo stesso preferito della referenza fornitore;
- prodotto interno senza fornitore: la stella usa i preferiti aziendali già esistenti;
- l’articolo del Catalogo viene adottato, con la funzione idempotente esistente, **solo quando si conferma la prima quantità**;
- Preferito e Da proporre per acquisto restano indipendenti, senza automatismi fra loro.

Non servono nuove tabelle né modifiche al database.

## Implementazione

1. **Unico insieme di prodotti**
   - Preparare per il workspace una lista uniforme che comprenda prodotti propri e articoli disponibili nei cataloghi.
   - Applicare Preferiti/Tutti, ricerca e filtri alla stessa lista.
   - `Tutti` include prodotti propri, preferiti e cataloghi; `Preferiti` include tutte le stelle, anche sugli articoli non ancora adottati.

2. **Unico workspace prima e dopo l’avvio**
   - Riutilizzare `PhysicalCount` e la scheda completa `ProductCard` anche senza sessione.
   - Eliminare il ramo visuale basato su `DraftCountCard`, senza creare una terza schermata.
   - Prima della sessione mostrare gli stati coerenti e disabilitare soltanto le azioni che richiedono uno storico; la prima conferma apre la sessione e aggiorna gli stessi elementi senza cambiare struttura.
   - Conservare la scelta esplicita della zona quando necessaria.

3. **Barra compatta e filtri**
   - Mantenere sempre visibili: Preferiti, Tutti, Da controllare, Confermati, Differenze, Da ricontare e Cerca.
   - Rimuovere la barra visuale Zone/Categorie/Sottocategorie/Prodotti/Cerca e il relativo percorso a riquadri.
   - Ampliare `Filtri` con Zona, Fornitore, Categoria, Sottocategoria e Stato conteggio.
   - Lasciare `Colonne` collegato alle preferenze già salvate per utente e dispositivo.

4. **Stella sempre sulla scheda**
   - Mostrare la stella direttamente su ogni `ProductCard`, senza dipendere dalla configurazione Colonne e senza nasconderla nel menu azioni.
   - Renderla disponibile per prodotti propri, interni e articoli Catalogo, con aggiornamento immediato dei filtri.
   - Il menu resta dedicato a Da ricontare, Non conforme, Da proporre per acquisto e Storico.

5. **Smartphone**
   - Usare gli stessi dati, filtri, stati e azioni del desktop; cambia soltanto la disposizione delle schede e del pannello Filtri.

## File previsti

- `src/components/inventory/inventory-count-panel.tsx`
- `src/lib/inventory-count.functions.ts`
- `roadmap.md`

## Verifica

- Prima e dopo la prima conferma: stessa struttura e nessun salto di interfaccia.
- Stella aggiunta/rimossa su prodotto proprio, prodotto interno e articolo Catalogo.
- Preferiti mostra tutte le tipologie stellate; Tutti mostra l’intero insieme previsto.
- Prima quantità su articolo Catalogo: adozione idempotente e conteggio; la sola stella non adotta.
- Filtri completi nel solo pannello Filtri; nessuna barra duplicata.
- Controllo desktop e smartphone, errori a schermo e compilazione.

## Fuori scope

Nessuna modifica a database, storico append-only, Non conforme, proposte acquisto, Fabbisogno, Lista della Spesa, formule, movimenti, listini o U.M.
