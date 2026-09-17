# Punto 5b.2 — Destinazioni cliente + importazione massiva clienti da Danea

Struttura che vogliamo consolidare **prima** di importare centinaia di clienti:

```text
Azienda registrata → rapporto B2B → Cliente Trevi → una o più Destinazioni → uno o più Indirizzi
poi (in futuro): Destinazione → Listino/condizioni → Ordine → DDT/Fattura → Danea
```

## 1. Che cosa ho verificato di Danea (senza inventare nulla)

Esportazione reale dei soggetti che mi hai inviato (`Soggetti_prova1-2`): una riga per cliente, con
Cod., Codice fiscale, Partita Iva, Denominazione, Indirizzo, Cap, Città, Prov., Regione, Nazione,
Cod. destinatario fatt. elettr., Rif. amministrativo, Referente, Tel., Cell, Fax, e-mail, Pec,
Sconti, Listino, Fido, Agente, Pagamento, Banca, Ns Banca, SDD, Resp. trasporto, Porto, Fatt. con Iva,
Dich. d'intento, Conto reg., Rit. acconto, Doc via e-mail, Note doc., Home page, Login web,
Libero 1-6, Note.

Conseguenza importante: **questo file contiene un solo indirizzo per cliente e nessuna colonna di
destinazione merce**. Quindi:

- non dedurrò destinazioni dai dati: righe con la stessa P.IVA e indirizzo diverso non diventeranno
  automaticamente due destinazioni, né due clienti distinti;
- l'importazione crea il cliente e una destinazione "Sede" iniziale (l'indirizzo del file);
- resta **da verificare con un'esportazione reale** come Danea espone le destinazioni merce
  (elenco "Destinazioni diverse" del soggetto) e se hanno un proprio codice: ti chiederò
  un'esportazione dedicata quando serviranno i DDT. Fino ad allora le destinazioni si creano a mano
  in Trevi Fruit.

## 2. Cliente, Destinazione, Indirizzo

- **Cliente Trevi** (`customer_records`, già esistente): l'intestatario, ragione sociale e P.IVA unica.
- **Destinazione** (nuova tabella `customer_destinations`): punto operativo/centro documentale del
  cliente, es. "Ristorante Centro". Campi: cliente proprietario, nome/etichetta, indirizzo collegato
  (`addresses`), codice interno, riferimento Danea, referente, telefono, note operative,
  attiva/non attiva, predefinita, separazione documentale/contabile (sì/no).
  Nessuna duplicazione dei dati fiscali della società madre: P.IVA, codice fiscale e dati di
  fatturazione restano sul cliente.
- **Indirizzo** (`addresses`, già esistente): il dato fisico con le sue funzioni
  (sede legale, sede operativa, consegna, ritiro, magazzino) e la visibilità verso i partner.

Una destinazione punta a un indirizzo esistente, quindi lo stesso indirizzo può servire più funzioni
senza essere duplicato.

## 3. Cosa vedrai nell'app

**Anagrafica clienti (Vendite → Clienti)**

1. Nuovo pulsante **Importa da Danea**: file Excel (.xlsx), CSV/testo o XML soggetti Danea.
2. Riconoscimento automatico delle intestazioni Danea sopra elencate, con abbinamento manuale per
   quelle non riconosciute.
3. **Anteprima obbligatoria** in tre gruppi: da creare, da aggiornare (riconosciuti per P.IVA, poi
   codice fiscale, poi codice Danea), scartati con motivo. Puoi deselezionare singole righe.
4. Conferma → riepilogo creati / aggiornati / scartati.
5. **Selezione multipla** nell'elenco clienti e "Genera inviti per i selezionati": elenco copiabile
   con nome, email e link d'invito; i clienti senza email sono segnalati.

**Scheda cliente**

6. Nuova sezione **Destinazioni**: elenco, aggiunta, modifica, attiva/disattiva, predefinita,
   scelta dell'indirizzo tra quelli del cliente e nota "documenti/contabilità separati".
7. Il pulsante **Invita** resta sulla scheda cliente (l'invito riguarda il cliente, non la destinazione).

## 4. Regole confermate

- Cliente già presente → i dati del file lo **aggiornano**; le note esistenti non vengono cancellate
  se il file non le contiene.
- L'importazione non crea account né rapporti commerciali: il collegamento nasce solo da un invito
  accettato.
- Nessun prodotto, listino o condizione viene toccato.

## 5. Preparazione a Ordina e al Punto 5c (solo struttura, niente implementazione)

- L'ordine futuro conserverà cliente **e** destinazione scelta, con snapshot congelato dei dati della
  destinazione e dell'indirizzo, così i documenti storici non cambiano.
- Il modello permetterà nel Punto 5c di tenere listino/condizioni sul cliente ed **ereditarli** nelle
  destinazioni, con eventuale override per singola destinazione: le condizioni potranno riferirsi al
  rapporto (cliente) oppure a una destinazione, senza rifare l'anagrafica.

## 6. Dettagli tecnici

- Migration: `customer_destinations` (id, seller_company_id, customer_record_id, address_id nullable,
  label, internal_code, danea_reference, contact_name, phone, notes, separate_documents boolean,
  status, is_default, created_by, created_at, updated_at), GRANT a `authenticated`/`service_role`,
  RLS con le funzioni esistenti (`owns_customer_record`, `is_company_admin`), unicità del default per
  cliente, indice su customer_record_id, trigger `set_updated_at`, audit sulle modifiche.
  Nessuna colonna GENERATED negli insert; funzioni `SECURITY DEFINER` con `search_path = public`.
- RPC `manage_customer_destination(create|update|activate|deactivate|set_default)`.
- Import: lettura nel browser con `xlsx` (SheetJS) per .xlsx, parser CSV con separatore `;`/`,`,
  `DOMParser` per l'XML soggetti; normalizzazione in `ParsedCustomerRow`, deduplica per P.IVA
  normalizzata, confronto con `customer_records`, salvataggio riga per riga con la RPC esistente
  `manage_customer_record` (codice Danea in `internal_reference`).
- Inviti multipli con `create_customer_invitation` in sequenza e gestione errori per singolo cliente.
- File: nuovi `src/lib/customer-import.ts`, `src/components/companies/customer-import-dialog.tsx`,
  `src/components/companies/destination-manager.tsx`; modificato
  `src/components/companies/customer-records-panel.tsx`. Nessun altro file toccato.

## 7. Test previsti

- Import del file di esempio in .xlsx e .csv: righe riconosciute, anteprima corretta.
- Reimport: tutti "da aggiornare", nessun duplicato; stessa P.IVA con indirizzo diverso → un solo
  cliente, nessuna destinazione inventata.
- Righe senza ragione sociale e P.IVA doppia nel file: scartate con motivo.
- Creazione di due destinazioni sullo stesso cliente, predefinita, disattivazione, collegamento a
  indirizzi diversi.
- Invito singolo dalla scheda e invito multiplo su più clienti.
- Isolamento: un altro venditore non vede clienti né destinazioni.
- Verifica su smartphone (545 px) e desktop.
