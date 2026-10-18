# Back end Piattaforma (super amministratore)

## Obiettivo
Trasformare i mockup `/piattaforma` in un sistema vero: super amministratore (solo Andrea all'inizio), team interno con permessi per sezione, registro eventi, nessuna modifica ai dati delle aziende clienti.

## Passo 1 — Database (migrazione)
1. Nuovo ruolo `piattaforma` nell'enum `app_role` (separato dai ruoli aziendali).
2. Tabella `platform_team_members`: utente, permessi per sezione (aziende, utenti, registro, assistenza, impostazioni) ciascuno `nessuno | vedi | modifica`, stato attivo/disattivato, creato da chi e quando. RLS: lettura/scrittura solo a chi ha ruolo `piattaforma`.
3. Tabella `platform_audit_log`: chi, cosa, su quale sezione, quando, dettagli. Solo inserimento, mai modifica o cancellazione. RLS: lettura solo a chi ha ruolo `piattaforma`.
4. Funzioni DB SECURITY DEFINER con `search_path = public`:
   - `is_platform_admin()` — vero solo per chi ha ruolo `piattaforma` attivo.
   - `platform_permission(sezione)` — restituisce il permesso dell'utente su quella sezione.
   - `manage_platform_team_member` — aggiungi/modifica/disattiva un membro (solo super admin, cioè il primo utente con ruolo piattaforma o chi ha permesso impostazioni=modifica; regola precisa da confermare).
   - `log_platform_event` — scrive nel registro.
5. GRANT + policy su ogni tabella nuova, come da regole del progetto.
6. Assegnazione iniziale: ruolo `piattaforma` ad Andrea (una sola riga, via SQL dopo la migrazione).

## Passo 2 — Accesso e protezione pagine
- Le pagine `/piattaforma/*` passano sotto controllo: chi non è nel team interno vede solo `/piattaforma/accesso` (accesso vero con email e password).
- Ogni pagina controlla il proprio permesso: chi ha «nessuno» non vede la sezione; chi ha «vedi» non ha comandi di modifica.

## Passo 3 — Dati veri nelle pagine
- Pannello: conteggi reali (aziende, utenti, ordini, consegne) in sola lettura.
- Aziende / Utenti: elenchi reali in sola lettura.
- Registro: eventi reali da `platform_audit_log`.
- Team interno: gestione vera (aggiungi, permessi, disattiva) — unica pagina con scrittura.
- Assistenza e Impostazioni: restano mockup finché non decidiamo cosa contengono.

## Cosa NON facciamo
- Nessuna modifica ai dati delle aziende clienti (solo lettura).
- Nessuna modifica a Lista della Spesa, Inventario, Ordini, Consegne, Danea.
- Nessuna pubblicazione.
- Registro eventi dell'app (ordini, consegne degli utenti): fase successiva, da decidere.

## Verifiche
- Test automatici sui permessi (chi non ha permesso non legge/scrive).
- Anteprima: accesso negato a utente normale, accesso consentito ad Andrea, permessi «vedi» senza comandi di modifica.
- Nessuna prova su dati reali oltre la lettura.

## File previsti
- Migrazione DB (nuovo file, via strumento migrazioni).
- `src/integrations/supabase/types.ts` (rigenerato).
- Nuovo `src/lib/platform.functions.ts` (funzioni server con controllo permessi).
- Modifica pagine `src/routes/piattaforma*.tsx` (da mockup a dati veri, una alla volta).
- Nuovo guard di accesso per le pagine piattaforma.
