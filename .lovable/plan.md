# Clienti: eliminazione con conferma e recupero dei clienti eliminati

## Obiettivo
Poter eliminare un cliente dalle azioni, con conferma, senza perdere i dati: il cliente sparisce dall'elenco e resta recuperabile da un pulsante "Clienti eliminati" in fondo alla pagina.

## Cosa cambia

### 1. Azione "Elimina cliente"
- Nel menu azioni di ogni riga (desktop e smartphone) si aggiunge **Elimina cliente**, in rosso, solo per gli amministratori.
- Al clic si apre una richiesta di conferma con il nome del cliente e la spiegazione che i dati non vengono cancellati e potranno essere recuperati.
- Confermando, il cliente viene contrassegnato come eliminato e non appare più nell'elenco, nella ricerca, nei conteggi, nelle selezioni, nelle stampe e nelle esportazioni.
- Indirizzi, destinazioni, note, listino assegnato e collegamenti restano intatti.

### 2. Pulsante "Clienti eliminati"
- In fondo alla pagina un pulsante mostra il numero di clienti eliminati (nascosto se sono zero).
- Aprendolo si vede l'elenco compatto degli eliminati (denominazione, P.IVA, città) con un pulsante **Ripristina** per ciascuno.
- Il ripristino riporta il cliente attivo nell'elenco con tutti i suoi dati.

## Note tecniche
- Nessuna cancellazione fisica: si usa lo stato `revocato` già previsto sull'anagrafica.
- La funzione `manage_customer_record` viene estesa con le operazioni `delete` e `restore` (SECURITY DEFINER, `search_path = public`, controllo amministratore, registrazione nel registro attività). Nessuna modifica a tabelle, colonne o permessi.
- Frontend: `src/components/companies/customer-records-panel.tsx` (azione, conferma, filtro elenco, sezione eliminati). Nessuna modifica a importazione Danea, inviti, collegamenti, listini o destinazioni.
