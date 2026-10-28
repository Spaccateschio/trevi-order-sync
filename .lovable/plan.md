# Quantità ordinabile per prodotto e U.M. di vendita

## Correzione definitiva recepita
- Nessun `quantity_step` su `units_of_measure`.
- Nessun `sell_half_case` su `products`.
- Nessuna impostazione in Impostazioni → U.M.
- Nessun riconoscimento dal codice della U.M.; `allows_decimals` non viene letto né modificato per questa regola.
- Nessun mockup: il selettore avrà salvataggio reale immediato, come richiesto.

## Dato e regole
Aggiungere **Quantità ordinabile** sulla singola configurazione U.M. di vendita del prodotto (`product_sale_units`):

| Valore | Passo effettivo |
|---|---:|
| Intera | 1 |
| Metà | 0,5 |
| Decimali | 0,1 |

**Default Metà** per tutte le **333 configurazioni esistenti** e per ogni configurazione nuova, manuale o creata dall'import Danea. Nessuna distinzione tra kg, cassa o qualsiasi altra U.M. Andrea correggerà le scelte prodotto per prodotto.

Danea non modifica mai la scelta già salvata. Le nuove configurazioni ricevono Metà dal default del database; gli aggiornamenti delle configurazioni esistenti conservano il valore.

Il passo effettivo deriva esclusivamente dal valore salvato su quella configurazione prodotto/U.M., senza fallback alle U.M. generali, al prodotto o al codice.

## Interfaccia e salvataggio
- Nella tab Vendita, accanto a **ogni U.M. del prodotto**, mostrare il selettore shadcn «Quantità ordinabile»: Intera / Metà / Decimali.
- Il selettore è modificabile dagli amministratori secondo i permessi esistenti; agli altri è mostrato in sola lettura.
- Ogni scelta avvia subito il salvataggio reale del solo nuovo campo; disabilitare il relativo selettore durante il salvataggio per evitare richieste concorrenti sulla stessa configurazione.
- In caso di errore, mantenere la scelta effettivamente salvata e mostrare il motivo; dopo successo aggiornare la lettura condivisa delle U.M. di vendita.
- Tutti i pulsanti e salvataggi attuali delle U.M., conversioni e visibilità restano al loro posto e non vengono riscritti.

## Dettagli tecnici
- Nuova migrazione additiva generata dallo strumento: `product_sale_units.order_quantity_mode text NOT NULL DEFAULT 'meta'`, con vincolo sui soli valori `intera`, `meta`, `decimali`. Nessun UPDATE di quantità, documenti, conteggi o altri campi.
- Nuova RPC `set_product_sale_quantity_mode(_sale_unit_id uuid, _mode text)`, `SECURITY DEFINER SET search_path = public`: identità esclusivamente da `auth.uid()`, verifica amministratore dell'azienda proprietaria della configurazione; nessun parametro utente o azienda. EXECUTE solo authenticated; autore aggiornamento derivato dalla sessione.
- Non estendere né cambiare le attuali RPC privilegiate delle U.M. La nuova chiamata usa `context.supabase`, con autorizzazione nel database.
- Verificare gli INSERT/UPSERT Danea e manuali: il nuovo campo resta omesso per ottenere il default nelle creazioni e non viene riscritto negli aggiornamenti. Non aggiungere alcuna regola basata sui codici.
- Helper puro: mappa soltanto `intera → 1`, `meta → 0.5`, `decimali → 0.1`; non legge `allows_decimals` e non inventa un passo quando manca una configurazione valida.

## File autorizzati
- Nuova migrazione sotto `drizzle/migrations/`, generata dallo strumento per colonna, vincolo, RPC e grant.
- `src/components/products/sales-unit-manager.tsx`: tipo della configurazione, selettore e aggiornamento dopo salvataggio.
- `src/components/products/products-workspace.tsx`: includere il nuovo campo nella lettura delle configurazioni, se la SELECT è esplicita; nessun'altra modifica al workspace.
- Nuovi `src/lib/sale-quantity-step.ts` e `src/lib/sale-quantity-step.test.ts`: mappa delle tre modalità e test concreti.
- Nuovi `src/lib/sale-quantity-mode.functions.ts` e `src/lib/sale-quantity-mode.functions.test.ts`: comando autenticato e test del percorso.
- `src/components/products/AGENTS.md`, `src/lib/AGENTS.md`: regole della configurazione per prodotto/U.M. e del salvataggio autenticato.
- `roadmap.md`: solo la voce di questo intervento.
- `src/integrations/supabase/types.ts`: rigenerato automaticamente dallo strumento, non modificato a mano.

Se dalle verifiche serve un altro file applicativo o modificare un percorso Danea, fermarsi e aggiornare il piano prima di intervenire.

## Verifiche e limiti
- Test di Intera=1, Metà=0,5, Decimali=0,1 e rifiuto di modalità non valide.
- Verificare default Metà sulle 333 configurazioni e sulle creazioni manuali/Danea; scelta esistente preservata dagli aggiornamenti Danea.
- Verificare indipendenza tra due U.M. dello stesso prodotto e tra prodotti che condividono la stessa U.M.
- Verificare autenticazione e verifica amministratore prima della scrittura, senza identità aziendali/utente fornite dal browser.
- Verificare interfaccia e letture senza cambiare prodotti reali durante le prove dell'assistente; salvataggio/rilettura operativo affidato ad Andrea su dati di prova autorizzati.
- Questa fase configura il dato e il passo effettivo: **non cambia ancora la validazione o l'arrotondamento dei campi quantità** degli ordini cliente, della Lista, degli ordini fornitore o dell'inventario. XML Danea invariato.

**Nessuna pubblicazione. Finora nessuna modifica applicativa o al database: soltanto verifiche, aggiornamento dei requisiti e del piano.**