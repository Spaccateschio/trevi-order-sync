# Importazione massiva clienti da Danea

Obiettivo: nella sezione **Anagrafica clienti** (Vendite → Clienti) poter caricare un file esportato da Danea per inserire molti clienti in un colpo solo, controllarli in anteprima, aprirne la scheda e inviare il link d'invito, anche a più clienti insieme.

## Cosa vedrai nell'app

1. Nuovo pulsante **Importa da Danea** accanto a "Nuovo cliente".
2. Scegli il file: Excel (.xlsx), CSV/testo (.csv/.txt) o XML soggetti Danea.
3. Riconoscimento automatico delle colonne dell'esportazione Danea (Cod., Codice fiscale, Partita Iva, Denominazione, Indirizzo, Cap, Città, Prov., Referente, Tel., Cell, e-mail, Note). Se un'intestazione non viene riconosciuta puoi abbinarla a mano.
4. **Anteprima obbligatoria** prima di salvare, con tre gruppi:
   - Nuovi clienti da creare
   - Clienti già presenti che verranno aggiornati (riconosciuti per partita IVA, in mancanza per codice fiscale, altrimenti per riferimento interno/codice Danea)
   - Righe scartate, con il motivo (ragione sociale mancante, partita IVA duplicata nel file, riga vuota)
   Puoi togliere la spunta a singole righe prima di confermare.
5. Alla conferma: riepilogo con creati / aggiornati / scartati.
6. Ogni cliente importato è già cliccabile: si apre la sua scheda con dati, indirizzi e il pulsante **Invita**.
7. **Invito multiplo**: caselle di selezione nell'elenco clienti + "Genera inviti per i selezionati"; risultato con un elenco copiabile di nome cliente, email e link d'invito (inclusi i clienti senza email, da completare prima).

## Regole confermate

- Cliente già presente → i dati del file **aggiornano** quello esistente; le note esistenti non vengono cancellate se il file non le contiene.
- L'importazione **non crea** collegamenti commerciali né account: crea solo l'anagrafica del venditore. Il collegamento nasce sempre da un invito accettato.
- Nessun catalogo o prodotto viene toccato: questa importazione riguarda solo i clienti.

## Dettagli tecnici

- Lettura del file nel browser: `xlsx` (SheetJS) per .xlsx, parser CSV con rilevamento separatore `;`/`,`, `DOMParser` per l'XML soggetti Danea (`<Customer>`/`<Subject>` con Company/VatCode/FiscalCode/Address/Postcode/City/Province/Phone/Mobile/Email/Notes).
- Normalizzazione in un tipo comune `ParsedCustomerRow`, deduplica per P.IVA normalizzata (`normalize_vat`), confronto con `customer_records` del venditore per calcolare l'anteprima.
- Salvataggio riga per riga tramite la RPC esistente `manage_customer_record` (`create`/`update`), quindi nessuna modifica a RLS o schema; il campo `internal_reference` accoglie il codice Danea.
- Inviti multipli tramite la RPC esistente `create_customer_invitation` in sequenza, con gestione degli errori per singolo cliente.
- File toccati: `src/components/companies/customer-records-panel.tsx` (pulsante, selezione, invito multiplo), nuovo `src/components/companies/customer-import-dialog.tsx` (caricamento + anteprima), nuovo `src/lib/customer-import.ts` (parser e confronto). Nessun altro file modificato.
- Aggiornamento di `roadmap.md` a lavoro concluso.

## Test previsti

- Import del file di esempio `Soggetti_prova1-2.ods` convertito in .xlsx e in .csv: righe riconosciute e anteprima corretta.
- Reimport dello stesso file: tutti i clienti risultano "da aggiornare", nessun duplicato.
- Riga senza ragione sociale e P.IVA doppia nel file: scartate con motivo.
- Apertura scheda cliente importato e invio invito singolo.
- Invito multiplo su più clienti selezionati.
- Verifica su smartphone (545 px) e desktop.
