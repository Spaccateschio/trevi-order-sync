# Importazione clienti Danea: importare tutti i dati compilati

Oggi l'importazione riconosce solo 11 campi (ragione sociale, P.IVA, codice fiscale, email, telefono, indirizzo, CAP, città, provincia, codice Danea, note). Tutte le altre colonne del file Danea restano su "Non importare" perché non esiste un posto dove salvarle.

## Cosa cambia

1. **Nuovi campi nell'anagrafica cliente**, riempiti automaticamente dall'importazione:
   - Regione, Nazione
   - Codice destinatario fattura elettronica, Riferimento amministrativo
   - Referente, Fax, PEC
   - Sconti, Fido, Agente, Pagamento, Banca, Nostra banca
   - **Listino**: il numero di listino Danea finisce nel listino assegnato al cliente, quindi il cliente vede subito i prezzi giusti.

2. **Qualsiasi altra colonna compilata** del file (es. Data Mandato SDD, campi liberi) viene conservata in un'area "Altri dati Danea" del cliente, così nessun dato si perde.

3. **Abbinamento automatico**: aprendo l'importazione, tutte le colonne riconosciute risultano già abbinate; "Non importare" resta solo per le colonne vuote o non riconoscibili, e si può sempre cambiare a mano.

4. **Scheda cliente**: i nuovi dati si vedono in un blocco "Dati amministrativi (Danea)" richiudibile, in sola lettura per i campi che arrivano dal gestionale, modificabili dagli amministratori dove ha senso (referente, fax, PEC).

5. **Aggiornamento senza perdite**: reimportando lo stesso cliente i nuovi campi si aggiornano solo se il file li ha compilati; le note e i dati inseriti a mano non vengono cancellati.

## Dettagli tecnici

- Migrazione additiva su `public.customer_records`: colonne `region`, `country`, `sdi_code`, `sdi_admin_reference`, `contact_name`, `fax`, `pec`, `discounts`, `credit_limit`, `agent`, `payment_terms`, `bank`, `our_bank` (tutte `text`, nullable) più `danea_extra jsonb`. Nessuna colonna esistente modificata o rimossa.
- `manage_customer_record` ricreata (DROP + CREATE per evitare overload) con i nuovi parametri opzionali, `SECURITY DEFINER`, `search_path = public`, controllo `is_company_admin`, grant a `authenticated` ripristinati; scrittura solo dei parametri passati (`COALESCE`) per non azzerare valori esistenti.
- `Listino` viene normalizzato a `smallint` e scritto in `assigned_price_list_number` solo se corrisponde a un listino Danea esistente; altrimenti resta nei dati extra con una segnalazione nell'anteprima.
- `src/lib/customer-import.ts`: `HEADER_MAP`, `IMPORT_FIELD_LABELS`, `XML_FIELDS` e `ParsedCustomerRow` estesi; colonne non riconosciute raccolte in `extra` con la loro intestazione.
- `src/components/companies/customer-import-dialog.tsx`: anteprima e invio aggiornati ai nuovi campi.
- `src/components/companies/customer-records-panel.tsx`: blocco "Dati amministrativi (Danea)" nella scheda cliente.

## Verifiche

- Import del file Danea reale: nessuna colonna compilata resta su "Non importare".
- Cliente con Listino 2 nel file → nell'anteprima risulta listino RISTORANTE e dopo l'import il cliente vede i prezzi.
- Reimport dello stesso file → nessun duplicato, note e dati manuali intatti.
- Colonna Danea sconosciuta → valore visibile in "Altri dati Danea".
- Controllo su computer e smartphone, typecheck e build senza errori.
