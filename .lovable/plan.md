# Ruoli aziendali, reparti e collaboratori

## Situazione attuale (analisi)
- Oggi ogni persona ha solo 3 ruoli fissi: amministratore, operatore, trasportatore. Nessun permesso per pagina o per azione.
- Gli inviti esistenti servono solo per i **clienti**, non per i collaboratori.
- I prodotti non hanno un reparto.
- La Lista della Spesa ammette **un solo ciclo aperto** per azienda (regola del semaforo Inventario → Lista → Ordini). Liste separate per reparto cambiano questa regola: va decisa con te (vedi Rischi).
- Gli ordini fornitore nascono da una lista sola; non sanno da quale reparto arriva una riga.

## Cosa vedrà l'amministratore
1. **Azienda → Collaboratori**: elenco persone, stato (attivo/disattivato), reparti, profilo.
2. **Invita collaboratore**: email, nome, profilo pronto da cui partire, reparti.
3. **Scheda permessi**: per ogni pagina una riga con le caselle
   Visualizzare · Creare · Modificare · Confermare · Inviare · Annullare · Eliminare · Stampare,
   più due interruttori: «Vede prezzi e costi», «Gestisce fornitori».
   Eccezioni per singolo fornitore (es. «può inviare ordini solo a Ortofrutta Rossi»).
4. **Azienda → Reparti**: crea, rinomina, disattiva (mai cancellare).
5. **Prodotti**: colonna e filtro «Reparto», assegnazione anche multipla.
6. Filtri per reparto, collaboratore e fornitore nelle pagine dell'amministratore.

## Profili pronti (modificabili dopo)
- **Super amministratore**: tutto, compresi permessi degli altri amministratori. Uno per azienda.
- **Amministratore**: tutto, gestisce collaboratori, non tocca il super amministratore.
- **Preparatore**: Preparazione e stampa.
- **Magazziniere**: Inventario, giacenze, Carico merce.
- **Compratore**: Lista della Spesa e Ordini fornitori dei suoi reparti.
- **Trasportatore**: Consegne e giri.

## Fasi (una alla volta, con conferma tra una e l'altra)
1. **Mockup** (solo schermate, dati inventati): Collaboratori, invito, scheda permessi, Reparti, filtro reparto. Nessun dato reale.
2. **Fondamenta**: reparti, prodotti↔reparti, profili e permessi salvati, invito collaboratori via email, registro di chi fa cosa. Gli utenti attuali restano con i permessi di oggi (nessuno perde accesso).
3. **Menu e pagine**: ogni collaboratore vede solo le pagine e i pulsanti permessi.
4. **Controllo nel database** sulle azioni già esistenti (Inventario, Lista, Ordini, Preparazione, Consegne): oltre al ruolo attuale, verifica permesso e reparto.
5. **Liste per reparto e ordine unico per fornitore**: richiede la tua decisione sul semaforo; ogni riga d'ordine conserva il reparto d'origine.

## Rischi da decidere prima
- **Super amministratore «riservato a te»**: intendi il titolare di ogni azienda cliente, oppure tu come gestore della piattaforma (già esistente in /piattaforma)?
- **Una lista o una per reparto**: oggi un solo ciclo aperto. Con i reparti: un ciclo per reparto, oppure un ciclo unico con liste interne per reparto (meno rischi, consigliato).
- **Prodotto in più reparti**: chi lo conta in Inventario? Proposta: un reparto «principale» per l'inventario.
- **Ordini già esistenti**: restano senza reparto, visibili solo agli amministratori.
- Fase 4 tocca funzioni di Inventario, Lista, Ordini, Consegne: le aggiungo solo controlli, senza cambiare calcoli, e la eseguo solo con tua autorizzazione esplicita per ciascuna area.

## Dettagli tecnici
- Nuove tabelle: `departments`, `product_departments`, `member_departments`, `member_permissions` (member, area, azione, reparto/fornitore opzionali), `permission_presets`, `member_invitations`; tutte con RLS sull'azienda dell'utente autenticato, scrittura solo via RPC SECURITY DEFINER (`search_path=public`) con controllo amministratore.
- Funzione unica `has_permission(company, area, action, department?, supplier?)` usata da RPC e policy; `company_member_roles` resta per compatibilità.
- `shopping_list_items` e `purchase_order_items` ricevono `department_id` facoltativo (aggiunta, nessuna rimozione).
- Ogni scrittura registra autore e ora in un registro append-only.
