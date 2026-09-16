# Roadmap

## Fase 1 — Fondazioni (completata)

## Fase 2 — Danea → Trevi Fruit (in corso)
- [x] Analisi protocollo Danea + 3 XML reali
- [x] Piano tecnico aggiornato sulle evidenze reali
- [x] Migrazione: collegamenti Danea, listini 1-9, prodotti, prezzi, costi fornitore, log sync
- [x] Endpoint pubblico di ricezione catalogo (multipart, risposta "OK")
- [x] Parser XML Easyfatt (full + incremental + DeletedProducts con solo Code)
- [x] Schermata tecnica di diagnostica: collegamento, token, esiti invii
- [x] Verifica con i 3 XML reali + FULL simulato (81 creati, reinvio idempotente, 80 depubblicati, aggiornamenti corretti); dati di prova rimossi
- [x] Salvataggio credenziali collegamento senza rigenerare l'indirizzo + rimozione credenziali con conferma
- [x] Pagine più compatte su telefono e desktop (tabelle scorribili, testi adattati)
- [ ] Primo FULL reale da Danea (in attesa: account amministratore da abilitare)

## Profilo di utilizzo COMPRO / VENDO / ENTRAMBI (completato)
- [x] Anagrafica azienda unica con can_buy / can_sell e indirizzo di consegna
- [x] Rapporti rinominati venditore ↔ acquirente, più fornitori indipendenti, nessun rapporto verso se stessi
- [x] Funzioni DB: register_company, request_supplier_relation, set_company_capabilities, available_suppliers, company_buys, company_sells
- [x] Onboarding in due passaggi dopo la verifica email
- [x] Menu diviso ACQUISTI / VENDITE con visibilità calcolata in un unico punto
- [x] Nome, cognome e telefono salvati nel profilo dalla registrazione
- [x] Attivazione successiva della seconda modalità dalla pagina Azienda
- [x] Test RLS e isolamento tra aziende superati

## Fasi successive (non iniziare)
Immagini prodotto, pagina Prodotti definitiva, U.M. alternative, listini ai clienti, ordini, ruoli e permessi avanzati, inviti utente.
