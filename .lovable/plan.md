# Ponte Incassi: aggiornamenti parziali senza doc_type

## Verifica (dal codice attuale)
- Il 400 nasce da `doc_type`: nello schema del corpo è `z.enum(["ddt","preventivo"])` senza `.optional()`, quindi un corpo con solo `external_id` e `consegna` viene rifiutato con `dati_non_validi` / `doc_type: Required`.
- Oggi gli unici campi obbligatori sono `external_id` (testo non vuoto, max 120) e `doc_type`. Tutti gli altri sono facoltativi.
- Lo schema è `strict`: un campo sconosciuto dà comunque 400 (resta così).
- Non ho letto i log della richiesta del DDT 16724. La causa è confermata solo dal codice: è l'unico campo obbligatorio che può mancare in un aggiornamento con `external_id`.

## Modifica
1. Schema: `doc_type` diventa facoltativo.
2. Il documento salvato si legge già oggi prima dell'upsert, cercandolo per `source` + `external_id`. Se esiste e `doc_type` manca, si usa il `doc_type` già salvato.
3. Se il documento non esiste e `doc_type` manca, la risposta è 400 `dati_non_validi` con il dettaglio `doc_type: obbligatorio per un documento nuovo`.
4. Un campo assente non cancella mai un valore salvato. `mergeDocument` lo fa già per i campi vuoti. Si aggiunge una correzione su `consegna`: oggi un `consegna` inviato senza `at` prende il `null` e quindi mantiene il valore salvato. Il comportamento resta lo stesso.
5. Chiave, risposte 200/202/401/503, interruttore e collegamento all'ordine restano invariati.

## Dettagli tecnici
- `src/lib/incassi/incassi-link.ts`: `mergeDocument(existing, incoming)` accetta `doc_type` facoltativo. Restituisce `{ ok: false, reason: 'doc_type_mancante' }` se è nuovo e senza tipo, altrimenti il documento unito. In alternativa si aggiunge un helper puro `resolveDocType(existing, incoming)` e la firma di `mergeDocument` resta compatibile.
- `src/routes/api/public/integrations/trevi-incassi/documents.ts`: `doc_type: z.enum([...]).optional()`, poi chiamata all'helper dopo la lettura di `existing`.
- Test in `src/lib/incassi/incassi-link.test.ts`:
  - aggiornamento senza `doc_type` su un documento esistente: accettato, con il tipo già salvato;
  - senza `doc_type` su un documento nuovo: rifiutato;
  - corpo con solo `consegna`: numero, data, cliente, note, righe e date già salvati restano uguali.
- Nessuna modifica al database, agli ordini, a Danea o alla ricezione merce.
