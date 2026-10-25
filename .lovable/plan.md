# Correzione autorizzazione del salvataggio U.M. di acquisto

## Verifica iniziale
La funzione attuale riceve `_actor_user_id` dalla funzione server e controlla che quell’utente sia un amministratore aziendale attivo. È eseguibile solo da `service_role`: il controllo non deriva quindi dalla sessione database dell’utente.

## Una sola correzione
- Nuova firma di `save_product_purchase_units` senza parametro utente: identità esclusivamente da `auth.uid()`, controllo amministratore nel database sull’azienda del prodotto.
- EXECUTE esclusivamente ad `authenticated`; revoca a `PUBLIC`, `anon` e `service_role`.
- Vecchia firma conservata ma disabilitata, senza alcun EXECUTE ai ruoli applicativi: nessun percorso privilegiato alternativo.
- La funzione server usa `context.supabase`, ossia la sessione dell’utente; nessuna chiave privilegiata o identità passata come parametro.
- Validazioni U.M., predefinita, blocco del prodotto, scrittura atomica e audit restano invariati.

## Controlli
Migrazione piccola in un’unica transazione gestita dal servizio: controllo ruolo iniziale e firme attese, verifica finale dei privilegi effettivi su entrambe le firme, SECURITY DEFINER e search_path. Successivo controllo read-only del database e test mirati della chiamata con sessione e senza parametro utente. Nessun salvataggio su aziende reali: il collaudo A–E su 3 EMME resta ad Andrea.

## Compatibilità e limite
Nessun cambiamento a tabelle o dati. Le versioni che usano ancora la vecchia firma non potranno salvare queste U.M. dopo la revoca: mantenerla accessibile sarebbe contrario alla correzione richiesta. Nessuna pubblicazione automatica.

## File previsti
- Nuova migrazione in `drizzle/migrations/`, generata e applicata dal servizio, con aggiornamento automatico dei tipi.
- `src/lib/product-purchase-units.functions.ts`.
- Nuovo test mirato `src/lib/product-purchase-units-auth.test.ts`.
- `AGENTS.md`: sostituzione della sola regola relativa a questa autorizzazione.

Nessuna modifica all’interfaccia, a Danea, ordini o giacenze; nessun invio; `roadmap.md` invariato.