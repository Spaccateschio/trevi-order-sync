# Clienti: elenco a tabella con ricerca rapida, selezione multipla e colonne scegliibili

## Obiettivo
Trasformare l'elenco clienti dalle schede grandi attuali a una tabella compatta tipo gestionale (come nella tua foto di Danea): caratteri più piccoli, una riga per cliente, ricerca rapida per nome, selezione multipla con totale e scelta delle colonne da vedere.

## Cosa cambierà nella pagina Clienti

### 1. Barra in alto (compatta)
- Campo **Cerca cliente**: filtra subito mentre scrivi su denominazione, P.IVA, città e codice Danea.
- Menu **Colonne**: elenco con spunte per scegliere quali dati vedere.
- Restano i pulsanti **Importa da Danea** e **Nuovo cliente**.
- Contatore a destra: "207 clienti · 12 selezionati".

### 2. Elenco a tabella
- Una riga per cliente, testo piccolo, righe alternate e intestazione fissa allo scorrimento.
- Casella di spunta a inizio riga + spunta nell'intestazione per **selezionare tutti i clienti filtrati**.
- Click sulla riga apre la scheda cliente a schede (Anagrafica / Rapporti commerciali / Varie) già esistente.
- Ordinamento cliccando sull'intestazione delle colonne.

### 3. Colonne disponibili
Visibili di default: Denominazione, Città, Prov., P.IVA, Telefono, e-mail, Listino, Collegamento.
Attivabili dal menu Colonne: Codice Danea, Codice fiscale, Indirizzo, CAP, Regione, Nazione, Cod. destinatario, Rif. amministrativo, Referente, Cell., Fax, PEC, Sconti, Fido, Agente, Pagamento, Coord. bancarie, Ns. banca, Stato, Invito.
La scelta delle colonne resta memorizzata sul tuo dispositivo.

### 4. Selezione multipla
- Barra azioni quando ci sono selezionati: totale, "Annulla selezione", "Genera inviti per i selezionati" (funzione già presente).
- Su smartphone: lista compatta a due righe per cliente, con spunta, ricerca e barra selezione identiche.

## Note tecniche
- Solo presentazione: nessuna modifica a database, RLS, RPC, import Danea, indirizzi/destinazioni o logica inviti.
- File toccati: `src/components/companies/customer-records-panel.tsx` (nuova tabella, ricerca, colonne, ordinamento; dialog scheda cliente invariato) e un piccolo file di supporto per la definizione delle colonne.
- Preferenza colonne salvata in `localStorage`; nessun campo nuovo sul database.
