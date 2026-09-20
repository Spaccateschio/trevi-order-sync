# Mockup Inventario — solo frontend e dati fittizi

## Obiettivo
Creare un prototipo cliccabile, fedele al flusso dell’immagine allegata e allo stile attuale di Trevi Fruit, senza leggere o scrivere dati reali dell’Inventario.

## Confini tassativi
- Nessuna migration, tabella, policy o modifica al database.
- Nessuna RPC nuova o modificata.
- Nessuna modifica alle formule o alle funzioni esistenti di Inventario, Fabbisogno, Lista della Spesa e FASE A/B/C/D.
- Tutte le interazioni del prototipo useranno stato React locale e dati fittizi, persi ricaricando la pagina.
- Il mockup sostituirà temporaneamente solo la presentazione delle schermate interessate; i componenti operativi attuali resteranno nel codice, senza essere alterati.

## 1. Impostazioni azienda → Magazzino
Aggiungere una schermata frontend “Magazzino” nell’area Azienda, visibile all’amministratore, con:
- elenco zone mock con nome, codice, stato e zona predefinita;
- aggiunta e modifica tramite finestra;
- scelta della zona predefinita;
- disattivazione/riattivazione con conferma visiva;
- messaggio chiaro che la zona predefinita sarà proposta nei conteggi.

Dati iniziali mock: Magazzino Mandrione `001` predefinito, Frigo `002`, Banco `003`, Cella `004`.

## 2. Acquisti → Inventario
Realizzare una vista operativa con le schede esistenti:
- **Conteggio**: riepilogo dell’attività e pulsante “Nuovo conteggio”; nessuna configurazione obbligatoria.
- **Fabbisogno**: anteprima frontend chiaramente dimostrativa, senza toccare la formula o il pannello reale.
- **Zone**: schede delle zone già configurate, con predefinita evidenziata, ricerca e passaggio vista schede/tabella.

Le zone mostrate saranno condivise nello stato locale del mockup con la schermata Magazzino durante la stessa sessione del browser.

## 3. Nuovo conteggio
Flusso cliccabile in due passaggi:
1. selezione zona, con “Magazzino Mandrione” già proposta;
2. conteggio prodotti.

Se rimane una sola zona attiva, “Nuovo conteggio” porta direttamente al conteggio. Con più zone, mostra la scelta e permette di cambiarla.

## 4. Conteggio rapido
Dati mock realistici con apertura iniziale su **Preferiti** e selettore **Preferiti | Tutti**.

Desktop/tablet:
- tabella compatta con Prodotto, U.M., Giacenza calcolata, Quantità contata, Differenza e azione rapida;
- ricerca prodotti;
- “Conferma quantità” per riga;
- “Conferma tutti invariati” per compilare rapidamente le righe non modificate;
- riepilogo delle righe confermate e differenze evidenziate.

Smartphone:
- righe touch compatte;
- quantità in campo numerico grande con controlli rapidi;
- conferma immediata per prodotto;
- barra azioni sempre raggiungibile;
- nessun passaggio superfluo.

La giacenza calcolata resta sempre separata dalla quantità fisicamente contata. Tutti i pulsanti aggiornano soltanto lo stato locale.

## 5. Stati e navigazione simulati
Saranno funzionanti visivamente:
- aggiunta/modifica/disattivazione zona e cambio predefinita;
- passaggio tra schede e tabella delle zone;
- avvio, annullamento e avanzamento del conteggio;
- filtri Preferiti/Tutti e ricerca;
- modifica e conferma quantità;
- conferma massiva degli invariati;
- riepilogo finale e ritorno all’Inventario.

Ogni salvataggio mostrerà esplicitamente un riscontro “Demo: nessun dato reale modificato”.

## 6. File previsti
- Nuovi componenti mock dedicati a impostazioni zone e inventario/conteggio.
- Modifica della pagina Azienda per esporre la sezione Magazzino mock.
- Modifica della pagina Acquisti → Inventario per mostrare il mockup.
- Eventuale piccolo modulo condiviso contenente esclusivamente dati e stato mock.
- Nessuna modifica ai file delle funzioni server, alle integrazioni o alle migrazioni.

## 7. Verifica
- Controllo visuale e cliccabilità a desktop/tablet e smartphone.
- Verifica di ricerca, filtri, finestre, selezione predefinita, conteggio e riepilogo.
- Controllo che nessuna azione del mockup generi richieste di scrittura al database.
- Controllo finale degli errori della preview.

Al termine mi fermerò: nessun collegamento al database verrà realizzato senza una nuova approvazione esplicita.
