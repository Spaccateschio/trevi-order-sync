# Rete chiusa: collegamenti solo su invito

## Cosa ho trovato (database reale e codice)

**Regole di lettura su `companies`**
- `companies_select_member_or_partner` (SELECT, authenticated): `is_company_member(id) OR shares_relation_with(id)`. `shares_relation_with` considera qualsiasi relazione in `supplier_customer_relations`, in ogni stato. Rispetta già la regola richiesta: non va toccata.
- `companies_update_admin` (UPDATE): non riguarda la lettura.

**Funzioni (SECURITY DEFINER, eseguibili da authenticated) che espongono aziende non collegate**
1. `search_companies(_query, _role)`: cerca per nome (ILIKE) o P.IVA (prefisso), fino a 50 aziende attive. Usata in `src/routes/_authenticated/collegamenti.tsx` (riga 365, vista «Cerca azienda», righe 626/715/926).
2. `available_suppliers()`: elenca tutti i venditori attivi. Nessun uso nel frontend.
3. `available_buyers()`: elenca tutti gli acquirenti attivi. Nessun uso nel frontend.
4. `company_exists_for_vat(_vat)`: dice se una P.IVA è registrata. Usata dentro le funzioni di invito (accettazione con nuova azienda) e nell'anteprima invito (`invito.$token.tsx`, campo calcolato dal server). Esposta però anche direttamente: chiunque autenticato può sondare P.IVA.
5. `customer_record_match_suggestions(_customer_record_id)`: dato un cliente in anagrafica, restituisce le aziende registrate con la stessa P.IVA (anche non collegate). Nessun uso nel frontend.
6. `request_supplier_relation` / `invite_customer_relation`: creano una richiesta verso un'azienda scelta per id, senza invito. La prima è usata dalla vista «Cerca azienda» (riga 421); la seconda non è usata nel frontend.

**Già a posto**
- `invitation_preview`, `supplier_record_match_suggestions` (solo relazioni già esistenti), area piattaforma (`piattaforma.aziende.tsx`, solo super admin, sola lettura).
- `connections-table.tsx` riga 197: testo «Usa Cerca azienda o Invita partner».

## Cosa farò

**Frontend (`collegamenti.tsx`, `connections-table.tsx`)**
- Nascondere per tutti il pulsante e la vista «Cerca azienda» (nome e P.IVA) e la richiesta collegata. Il codice resta, spento.
- Testo vuoto: «Usa Invita partner».

**Database (una migrazione)**
- Nuova colonna `companies.is_discoverable boolean NOT NULL DEFAULT false`. Modificabile solo dal super admin: un trigger blocca il cambio se `_is_active_platform_super()` è falso. Nessuna schermata per cambiarla (fuori scope).
- `search_companies`: restituisce solo aziende con `is_discoverable = true` (oggi nessuna, quindi niente risultati).
- `request_supplier_relation` e `invite_customer_relation`: accettate solo se l'azienda di destinazione è `is_discoverable`, oppure se esiste già una relazione tra le due aziende (riattivazione invariata).
- `available_suppliers`, `available_buyers`: stesso filtro `is_discoverable` (non usate, restano per il futuro).
- `customer_record_match_suggestions`: restituisce solo aziende con relazione già esistente col venditore, oppure `is_discoverable`.
- `company_exists_for_vat`: tolto EXECUTE a authenticated (REVOKE). Resta usata internamente dalle funzioni di invito e dall'anteprima, che girano con i permessi del proprietario.

**Non toccato**: policy `companies_select_member_or_partner`, inviti (creazione, link, codice, PDF/QR, accettazione anche con nuova azienda), doppio consenso, relazioni esistenti, destinazioni, catalogo, listini, area piattaforma.

## Flag futuro
Confermo: `is_discoverable` è previsto, default falso, solo super admin. Vetrina pubblica e filtro per zona fuori scope.

## Rischio da segnalare
L'accettazione invito con nuova azienda indica ancora se la P.IVA è già registrata, ma solo a chi ha un invito valido: accettabile secondo la regola, ma lo segnalo.

## Verifica
- Da utente 3 EMME: la pagina Collegamenti non mostra «Cerca azienda»; chiamare `search_companies`, `company_exists_for_vat`, `request_supplier_relation` verso un'azienda non collegata restituisce vuoto o errore.
- Inviti e relazioni esistenti invariati. Nessuna prova su Trevi, nessuna pubblicazione.
