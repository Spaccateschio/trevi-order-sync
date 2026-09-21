# Giorni di consegna dei fornitori

## Obiettivo
Impostare per ogni fornitore i giorni in cui consegna (tutti i giorni per default, poi si spengono i giorni non validi con pulsanti on/off), con la possibilità di indicare anche una consegna mensile in un giorno preciso del mese. Nell'inventario e nella lista della spesa il dato viene **segnalato, mai usato per filtrare o nascondere**.

## Come si usa
- Nella scheda del fornitore compare una riga "Giorni di consegna" con sette pulsanti: Lun Mar Mer Gio Ven Sab Dom. Di default tutti accesi.
- Sotto, un campo facoltativo "Consegna mensile il giorno" (1–31): si usa per i fornitori che consegnano una volta al mese; quando è impostato i pulsanti settimanali restano spenti.
- Nella riga Fornitori del tab Acquisto di un prodotto, ogni referenza mostra i giorni ereditati dal fornitore e un interruttore "Eccezione per questo prodotto": se attivo si impostano giorni diversi solo per quell'articolo.
- Nella lista della spesa, accanto a ogni fornitore assegnato, un'etichetta discreta: "Consegna oggi" oppure "Non consegna oggi — prossima: mercoledì 23". Nessuna riga viene nascosta o riordinata.
- Nell'inventario, nella scheda prodotto (tab Inventario e tab Acquisto) la stessa etichetta accanto al fornitore.

## Regole
- Default: tutti i giorni attivi. Un fornitore senza impostazione si comporta come oggi.
- Se tutti i giorni sono spenti e non c'è giorno del mese, l'etichetta dice "Giorni di consegna non impostati" (nessun blocco).
- L'eccezione di prodotto, se presente, vince sul calendario del fornitore.
- L'impostazione non tocca ordini, fabbisogno, giacenze, prezzi o permessi: è puramente informativa.

## Dettagli tecnici
Database (una sola migrazione):
- `supplier_records`: nuove colonne `delivery_weekdays smallint[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}'` (ISO 1=lun … 7=dom) e `delivery_month_day smallint NULL CHECK (between 1 and 31)`.
- `product_supplier_links`: nuove colonne `delivery_weekdays smallint[] NULL` e `delivery_month_day smallint NULL` (NULL = eredita dal fornitore).
- Nuova RPC `set_supplier_delivery_schedule(_supplier_record_id, _weekdays, _month_day)` e `set_product_supplier_delivery_schedule(_link_id, _weekdays, _month_day)`: `SECURITY DEFINER`, `search_path = public`, riuso dei controlli esistenti (`owns_supplier_record` / `is_company_admin`, `company_buys`). Nessuna modifica a `manage_supplier_record` né alle RLS esistenti.
- Nessuna colonna GENERATED, nessun dato esistente modificato (solo i default).

Frontend:
- `src/lib/delivery-schedule.ts` (nuovo): tipi, default, `isDeliveryDay(date, schedule)`, `nextDeliveryDate(date, schedule)`, etichette in italiano.
- `src/components/suppliers/delivery-days-picker.tsx` (nuovo): sette toggle compatti shadcn/ui + campo giorno del mese; usato nella scheda fornitore e, con l'interruttore eccezione, nella referenza prodotto.
- `src/components/companies/supplier-records-panel.tsx`: aggiunta della riga "Giorni di consegna" al form fornitore.
- `src/components/products/product-suppliers-manager.tsx`: eccezione per referenza + etichetta di consegna.
- Lista della spesa (`shopping_list_item_suppliers`, vista fornitori assegnati): sola etichetta informativa, nessun filtro.

Fuori scope in questo intervento: settimane alterne, festività, filtri o ordinamenti automatici nelle liste.
