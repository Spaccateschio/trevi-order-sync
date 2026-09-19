# Anagrafica Fornitori e aggancio automatico anagrafica ↔ collegamento B2B

Obiettivo: una sola relazione B2B che ha senso da entrambi i lati.

```text
TREVI                          relazione B2B                       ROSSI
supplier_records(Rossi) ◄── supplier_record_id ┐
                                               │ supplier_customer_relations
customer_records(Trevi, di Rossi) ◄── customer_record_id ┘
```

Principio comune: collegamento B2B attivo → esiste sempre l'anagrafica locale
dei due lati. Il contrario no: un cliente o un fornitore può esistere senza
alcun collegamento e senza registrarsi su Trevi Fruit.

## 1. Caso C dei clienti (prima di tutto)

Oggi un collegamento può diventare attivo con `customer_record_id` a NULL
(richiesta del cliente, invito con codice, invito senza scheda). Al momento in
cui la relazione diventa attiva, il lato venditore ottiene sempre la sua scheda
cliente:

- se la relazione ha già una scheda collegata, nulla cambia;
- altrimenti si cerca una scheda del venditore con la stessa P.IVA normalizzata
  (e, in mancanza di P.IVA, lo stesso codice fiscale), limitatamente alle schede
  non ancora collegate ad altra relazione;
- corrispondenza unica → viene collegata;
- nessuna corrispondenza → viene creata la scheda dai dati dell'azienda
  collegata (ragione sociale, P.IVA, indirizzo, contatti), con archivio non
  assegnato e listino predefinito del venditore;
- più corrispondenze (anche la stessa P.IVA presente in archivi Danea
  diversi), oppure P.IVA discordante → nessun collegamento automatico: quel
  lato della relazione resta segnato come "anagrafica da associare" e
  l'amministratore scegli lui la scheda. Nessuna fusione automatica e nessun
  uso della tabella delle proposte di aggiornamento dati, che ha un altro
  significato.

Identificatori nel riconoscimento B2B: solo dati realmente comuni ai due lati —
P.IVA normalizzata, in mancanza codice fiscale; mai ragione sociale o
indirizzo. Il codice Danea non viene usato qui, perché è locale al nostro
archivio e l'azienda partner non lo possiede. Archivio + codice Danea resta
invece l'identificatore prioritario quando riconosciamo o aggiorniamo una
scheda proveniente dallo stesso archivio Danea (import e futuro ritorno degli
ordini a Danea).

I due lati sono indipendenti: la stessa relazione può avere la scheda cliente
del venditore risolta e la scheda fornitore dell'acquirente da associare, o
viceversa.

## 2. Anagrafica Fornitori (gemella dei Clienti)

`supplier_records`, posseduta dall'azienda che compra, con: archivio Danea,
codice Danea, ragione sociale, P.IVA e codice fiscale (con P.IVA normalizzata),
indirizzo, contatti (referente, telefono, fax, e-mail, PEC), campi
amministrativi Danea più "altri dati", note, stato attivo/disattivato/revocato.
Nessuna cancellazione definitiva: eliminazione morbida come per i clienti, con
recupero.

## 2bis. Indirizzi e destinazioni: una sola struttura per entrambi i lati

Nessuna seconda gestione degli indirizzi. Si generalizzano le strutture
esistenti invece di duplicarle:

- gli indirizzi restano in un'unica tabella, con le funzioni già previste
  (sede legale, sede operativa, consegna, ritiro, magazzino): per un fornitore
  si usano sede, magazzino e ritiro, per un cliente consegna e sedi;
- le destinazioni operative diventano comuni ai due lati: oggi appartengono al
  cliente, in più potranno appartenere al fornitore (punti di ritiro), con
  esattamente un proprietario per riga;
- ogni indirizzo e ogni destinazione conservano tutti i campi che l'ordine
  Danea richiede: nome, indirizzo, CAP, città, provincia, nazione, più
  referente e telefono, così la destinazione scelta in un futuro ordine si
  traduce direttamente nei dati di consegna Danea;
- il modello non è disegnato sulla pagina attuale: la destinazione è
  un'entità con identità stabile, quindi un futuro ordine potrà salvarne una
  copia immutabile (nome/indirizzo/CAP/città/provincia/nazione) accanto ad
  archivio e codice cliente Danea, senza dipendere dalle modifiche successive
  all'anagrafica. Gli ordini e la copia non vengono realizzati adesso.

Simmetria completa: il fornitore ottiene la sua scheda locale quando il
collegamento diventa attivo, con le stesse regole del punto 1 (P.IVA
normalizzata, nessun merge ambiguo).

## 3. Pagina Acquisti → Fornitori

Stessa UX di Vendite → Clienti, riusando i componenti esistenti: elenco a
tabella compatta con ricerca rapida, colonne scegliibili, ordinamento,
trascinamento e ridimensionamento colonne, selezione multipla con stampa,
Excel e CSV, scheda di dettaglio a schede, indirizzi e punti di ritiro,
creazione manuale, importazione massiva Danea con archivio obbligatorio,
stato, riferimento Danea, indicatore Non collegato / Collegato Trevi Fruit con
scorciatoia a Collegamenti. La gestione del collegamento resta in Collegamenti.

## 4. Import fornitori Danea

Stesso motore dell'import clienti: scelta obbligatoria dell'archivio prima
dell'anteprima, nessuna deduzione dal file, confronto limitato all'archivio
scelto (stesso codice o stessa P.IVA in archivi diversi = schede distinte),
anteprima in tre gruppi (nuovi / aggiornati / invariati), nessuna perdita di
note e dati inseriti a mano.

## 5. Fuori scope ora

Prodotto ↔ fornitore (molti-a-molti con costi, U.M., codice fornitore,
preferito, quantità minima), lista della spesa e ordini al fornitore. La
struttura resta pronta: il prodotto verrà associato alla nostra anagrafica
fornitore locale, mai alla relazione B2B.

## Dettagli tecnici

Migrazione 1 — aggancio anagrafica ↔ B2B:
- `resolve_relation_records(_relation_id)`, `SECURITY DEFINER`,
  `search_path = public`: garantisce `customer_record_id` lato venditore e
  `supplier_record_id` lato acquirente; match nell'ordine archivio+
  `internal_reference`, poi `vat_normalized`, poi `tax_code`, solo su schede
  libere; crea la scheda mancante dai dati di `companies`; su ambiguità nessuna
  scelta automatica: `supplier_customer_relations.record_match_required boolean`
  segna il lato da associare a mano (nessun uso di
  `customer_record_proposed_updates`); audit su `audit_events`.
- Chiamata da `accept_invitation_row`, `accept_invitation_with_new_company`,
  `decide_company_relation` e `set_relation_side_enabled` quando la relazione
  passa ad `attivo`. Nessuna modifica al modello a doppio consenso, agli stati
  né ai codici invito.
- `supplier_customer_relations.supplier_record_id uuid` FK a
  `supplier_records`, nullable, indice unico parziale come per
  `customer_record_id`. Le due relazioni direzionali (A vende a B e B vende ad
  A) restano due righe distinte: ognuna ha il proprio `customer_record_id`
  (lato seller) e `supplier_record_id` (lato buyer), quindi la stessa coppia di
  aziende può avere quattro schede locali senza collisioni. Verifica inclusa nel
  vincolo: una scheda non può essere collegata a due relazioni.

Migrazione 2 — anagrafica fornitori:
- `public.supplier_records` con `buyer_company_id`, `archive_id` (FK
  `danea_archives`, trigger di coerenza azienda come per i clienti),
  `internal_reference`, ragione sociale, `vat_number`/`vat_normalized`
  (trigger `set_vat_normalized`), `tax_code`, indirizzo, contatti, campi
  amministrativi Danea, `danea_extra jsonb`, note, `status`, timestamp con
  trigger `set_updated_at`.
- GRANT: `SELECT, INSERT, UPDATE, DELETE` a `authenticated`, `ALL` a
  `service_role`, nessun accesso `anon`; RLS abilitata con lettura/scrittura
  ristretta ai membri dell'azienda proprietaria (`is_company_member` /
  `is_company_admin`), scritture solo via RPC.
- Generalizzazione (nessuna tabella parallela): `addresses`,
  `address_functions` e `customer_destinations` ottengono
  `supplier_record_id uuid` nullable, con vincolo di proprietario unico
  (azienda | cliente | fornitore) e policy RLS aggiornate sullo stesso
  schema di quelle esistenti. `customer_destinations` diventa la tabella
  comune dei punti operativi (consegna per i clienti, ritiro/magazzino per i
  fornitori); il nome resta per non rompere il codice esistente. Si verifica
  che i campi richiesti dall'ordine Danea (nome, indirizzo, CAP, città,
  provincia, nazione) siano presenti e non nulli dove servono, così la futura
  copia immutabile nell'ordine è una semplice lettura.
- RPC `manage_supplier_record`, `manage_supplier_record_status`,
  `manage_supplier_destination`, `supplier_record_match_suggestions`,
  `link_supplier_record_to_relation`, tutte
  `SECURITY DEFINER` con `search_path = public`, controllo `is_company_admin` +
  `company_buys`, `COALESCE` in aggiornamento per non azzerare dati, audit.

Frontend:
- `src/lib/supplier-columns.ts` e `src/lib/supplier-export.ts` derivati da
  quelli clienti; `src/lib/customer-import.ts` generalizzato (parser, mappatura
  intestazioni, anteprima) e condiviso, con registro campi per fornitori.
- `src/components/companies/supplier-records-panel.tsx` e
  `supplier-import-dialog.tsx` costruiti sui componenti clienti; riuso diretto
  di `address-manager.tsx` e `destination-manager.tsx`.
- `src/routes/_authenticated/acquisti.fornitori.tsx` sostituisce il rimando
  attuale a Collegamenti, con head dedicata.
- `src/lib/relation-link-status.ts` riusato per l'indicatore di collegamento.
- Nessuna modifica a Prodotti, listini, catalogo, visibilità B2B, Collegamenti,
  inviti, registrazione e import Danea prodotti.

Verifiche: caso C su invito con codice, richiesta cliente e invito senza scheda;
relazioni incrociate A↔B; import fornitori con due archivi e stesso codice;
typecheck, build e controllo su desktop e smartphone.
