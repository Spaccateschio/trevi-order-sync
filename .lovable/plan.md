# Campanella notifiche

## Cosa vedrà l'utente
- Una **campanella** in alto, sempre visibile (smartphone e computer), con un **numero rosso** delle notifiche non lette.
- Toccandola si apre un elenco: titolo, breve testo, data/ora (24h), pallino per le non lette. Toccando una notifica si va alla pagina giusta (es. l'ordine) e diventa letta.
- Pulsante **«Segna tutte come lette»**.
- Le notifiche arrivano **in tempo reale**, senza ricaricare la pagina.

## Notifiche già incluse al primo passo
1. **Nuovo ordine ricevuto**: quando un cliente B2B (es. 3 EMME) invia un ordine, il fornitore (es. Trevi) riceve «Nuovo ordine ORD-… da 3 EMME ROMA SRL».
2. **Ordine annullato**: quando un cliente annulla un ordine già inviato, il fornitore riceve «Ordine ORD-… annullato da …».

Le notifiche sono per **azienda**: tutti i collaboratori attivi dell'azienda le vedono; ognuno ha il proprio stato «letta/non letta».
Altre notifiche future si aggiungeranno nello stesso posto, senza rifare la campanella.

## Cosa non tocco
Ordini, Consegne, Carico Merce, Lista della Spesa, Inventario, semaforo: solo si «agganciano» gli eventi esistenti, nessuna regola cambia. Nessuna email/WhatsApp in questo passo.

## Dettagli tecnici
- Tabelle: `notifications` (company_id, type, title, body, link, entity_id, created_at) e `notification_reads` (notification_id, user_id, read_at). RLS con `company_id = get_user_company_id()` / appartenenza attiva; GRANT a authenticated/service_role.
- Creazione tramite trigger SECURITY DEFINER (search_path = public) sugli ordini B2B: insert in stato inviato e passaggio a annullato → notifica all'azienda venditrice. Mai company_id dal browser.
- RPC `mark_notifications_read(_ids uuid[] | null)`.
- Realtime sulla tabella `notifications`.
- UI: componente `NotificationBell` (shadcn Popover + Badge, icona lucide Bell) inserito in `app-shell.tsx`, sia nella barra mobile sia in una barra desktop/area sidebar. Colori solo da token.
