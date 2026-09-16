# Collegamento Danea: salvataggio credenziali + pagine più compatte

## Problema riscontrato

L'errore `403 Collegamento Danea revocato` significa che l'indirizzo inserito dentro Danea
appartiene a un collegamento più vecchio, non a quello attivo. Nel database esistono due
collegamenti: quello del 07:34 (revocato) e quello del 07:35 (attivo, riferimento `84803d8b…`,
login `andrea` con password salvata). Il collegamento attivo non ha mai ricevuto invii.

Causa a monte: l'unico pulsante disponibile per salvare Login e Password è "Rigenera
collegamento", che genera un nuovo indirizzo e revoca il precedente. Chi vuole solo salvare le
credenziali finisce per invalidare l'indirizzo già inserito in Danea.

## Cosa cambio

### 1. Salvataggio credenziali senza cambiare l'indirizzo

- Nuova funzione lato server che aggiorna solo Login e Password del collegamento attivo, con le
  stesse verifiche già in uso (solo amministratore dell'azienda) e registrazione nel registro
  attività. La password continua a essere conservata solo come impronta, mai in chiaro.
- Nella pagina "Collegamento gestionale": pulsante **Salva login e password** accanto ai campi,
  più la possibilità di rimuovere la password lasciando il campo vuoto e confermando.
- "Rigenera collegamento" resta, ma separato, con avviso chiaro che l'indirizzo cambia e va
  reinserito in Danea.

### 2. Indirizzo sempre recuperabile

L'indirizzo completo contiene la chiave segreta e per sicurezza si vede una sola volta. Per non
restare bloccati: sotto il collegamento attivo mostro un promemoria che spiega che, se l'indirizzo
è stato perso, va rigenerato e reincollato in Danea. Il pulsante "Copia indirizzo" resta
disponibile subito dopo la creazione.

### 3. Pagine più compatte e leggibili sullo schermo

- Contenuti più larghi e con meno spreco di spazio: riduco i margini interni delle schede e la
  dimensione dei titoli sui telefoni, mantenendo la leggibilità.
- Le tabelle (invii ricevuti, prodotti) restano scorribili in orizzontale e non spingono più la
  pagina fuori schermo; testo delle tabelle un gradino più piccolo.
- Testi lunghi come l'indirizzo di ricezione vanno a capo senza uscire dalla scheda.

## Fuori ambito

Non toccherò la logica di ricezione dei prodotti da Danea (Fase 2 già verificata) né il profilo
COMPRO/VENDO/ENTRAMBI: solo aggiunta del salvataggio credenziali e ritocchi di presentazione.

## Verifica finale

Dopo le modifiche provo un invio reale simulato verso l'indirizzo attivo (con login e password) per
confermare che la ricezione risponda `OK`, e controllo le pagine su schermo telefono e desktop.
