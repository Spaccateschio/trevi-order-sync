# Attivare Salva per la nuova U.M.

## Modifica
- Collegare «Salva» al comando già utilizzato in Impostazioni → Unità di misura.
- Salvare nella stessa anagrafica aziendale già mostrata nelle Impostazioni: nessun nuovo elenco o impostazione separata.
- Abilitare il pulsante quando Sigla e Descrizione sono compilate; durante il salvataggio impedire invii ripetuti.
- Eliminare «Anteprima — nessun salvataggio» da questo riquadro.
- Dopo il successo aggiornare l'elenco U.M. e riaprire il menu nella stessa scheda. Nessuna associazione automatica al prodotto: la scegli tu.
- In caso di errore lasciare il riquadro aperto e conservare i campi compilati, mostrando il motivo.
- Mantenere i controlli amministratore, sigle duplicate e uso Acquisto/Vendita/Entrambi. Le U.M. di solo acquisto non compaiono nel menu vendita.

## File autorizzati
- `src/components/products/sales-unit-manager.tsx`: collegamento al comando esistente, stato di salvataggio, aggiornamento elenco ed errori.
- `src/components/products/AGENTS.md`: sostituire la regola dell'anteprima con quella del salvataggio separato dall'associazione al prodotto.

## Verifiche e limiti
- Verificare campi vuoti, invio e gestione degli errori con dati simulati, senza scrivere su Trevi o altre aziende reali.
- Il collaudo con creazione reale resta ad Andrea su 3 EMME; nessuna creazione di U.M. da parte dell'assistente.
- Nessuna modifica alle funzioni server, allo schema del database, a Danea, agli ordini, alle giacenze o a `roadmap.md`; nessuna pubblicazione.