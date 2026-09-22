# Inventario: come salverò "Non conforme" e "Da proporre per acquisto"

Impostazione generale confermata. Qui solo i due chiarimenti richiesti; il resto del piano (riconta append-only, quattro stati, griglia su `user_grid_preferences`, filtri principali + avanzati, colonne acquisto/fabbisogno in sola lettura) resta come concordato.

## 1. Non conforme: storicizzato, non sovrascrivibile

La segnalazione vive **insieme al conteggio, nello storico append-only**, non come stato che si riscrive.

Ogni conferma (o sola segnalazione) scrive una riga in `inventory_count_entries`, che non si modifica né si cancella:

- quantità fisica confermata e U.M. usata
- non conforme sì/no
- quantità non conforme (facoltativa, nella stessa U.M. del conteggio)
- motivo/nota
- chi ha registrato e quando
- tipo di registrazione: conteggio, riconteggio, sola segnalazione, revoca della segnalazione

La "fotografia corrente" (`inventory_counts`) continua a riportare l'ultimo valore, così le formule di giacenza non cambiano. La segnalazione attuale è semplicemente l'ultima riga dello storico.

Il tuo esempio si ricostruisce interamente:

```text
07:00  conteggio      20 kg   non conforme 5 kg   "prodotto deteriorato"   Andrea
08:00  revoca         —       non conforme no     "scarto effettuato"      Andrea
08:00  rettifica      −5 kg   (movimento di scarto esplicito)              Andrea
```

Regole: la giacenza resta 20 kg; i 5 kg non vengono mai sottratti automaticamente; solo una rettifica/movimento di scarto esplicito abbassa la giacenza. La quantità non conforme è facoltativa (posso sapere che c'è un problema senza averlo quantificato) e, quando entrambe le quantità sono note, non può superare la quantità fisica confermata; se supera, il salvataggio viene rifiutato con messaggio chiaro.

## 2. Da proporre per acquisto: segnalazione persistente del prodotto

Non è uno stato della sessione: vive sul **prodotto**, quindi sopravvive alla chiusura dell'inventario.

Nuova tabella `product_purchase_proposals` (una proposta aperta per prodotto e azienda):

- prodotto e azienda
- chi ha segnalato e quando
- nota facoltativa
- origine (conteggio inventario, oppure segnalazione manuale) e riferimento alla sessione in cui è nata
- stato: **aperta** o **risolta**, con chi l'ha risolta, quando e perché

Comportamenti:

- **Quando è risolta**: quando la proposta viene portata in Lista della Spesa e quella lista viene confermata, oppure quando tu la archivi a mano ("non serve più"). La chiusura dell'inventario non la risolve.
- **Se viene segnalata di nuovo**: se esiste già una proposta aperta, non si crea un doppione — si aggiorna data/autore e si aggiunge la nota. Se la precedente era risolta, ne nasce una nuova, e la storia precedente resta leggibile.
- **Come arriva alla Lista della Spesa**: la lista mostra le proposte aperte come **suggerimenti da confermare**, accanto al Fabbisogno. Nessuna riga creata automaticamente, nessun ordine, nessun fornitore scelto dal sistema: le righe nascono solo quando le confermi tu. È esattamente il comportamento già previsto da FASE C.
- Mai contato e zero verificato possono generare la proposta con un tocco, ma restano informazioni distinte: "quantità sconosciuta" non diventa mai zero.

## Dove si vede

- Nella scheda/riga di conteggio: segnalazione "Non conforme" con nota e quantità facoltativa, e "Da proporre per acquisto", entrambe nel menu della riga per non riempire la scheda di pulsanti.
- Colonne opzionali della griglia: Non conforme e Da proporre per acquisto, più lo storico apribile del prodotto (10 → 8, con le segnalazioni).

## Cosa resta fuori

Fabbisogno e sue formule, creazione di righe di spesa o ordini, ripartizione fra fornitori, FASE A/B/C/D, listini, U.M.
