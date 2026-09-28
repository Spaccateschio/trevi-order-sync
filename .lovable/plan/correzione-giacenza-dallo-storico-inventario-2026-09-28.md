# Correzione giacenza dallo storico inventario

## Obiettivo
Rendere immediatamente correggibile una giacenza errata dalla finestra **“Inventario chiuso — sola lettura”**, senza riaprire né alterare l’inventario chiuso.

## Comportamento
- La dicitura **sola lettura** continuerà a indicare che quantità, note e conteggio originali non sono modificabili.
- La tabella avrà una colonna **Azioni** con **Correggi giacenza** sulla riga del prodotto.
- Il comando sarà disponibile solo agli amministratori e solo quando quel conteggio è l’ultimo conteggio compatibile che contribuisce alla giacenza corrente del prodotto.
- Se una riga storica è stata superata da un conteggio successivo, non sarà correggibile; verrà indicato chiaramente il motivo.
- **Correggi giacenza** aprirà la finestra già esistente con quantità corretta e motivo obbligatorio.
- Il conteggio originale resterà intatto; verrà registrata una rettifica separata con quantità, motivo, utente, data e riferimento al conteggio originale.
- Dopo il salvataggio verranno aggiornati subito giacenza e storico visualizzati.
- Nessuna quantità verrà modificata automaticamente nella Lista della Spesa; resterà l’avviso di ricontrollarla quando necessario.

## Interfaccia
- Desktop/tablet: colonna **Azioni** a destra della tabella, raggiungibile con lo scorrimento orizzontale; Codice e Descrizione restano fissi.
- Smartphone: pulsante **Correggi giacenza** nella scheda del prodotto.
- Il messaggio della finestra diventerà: **“Inventario chiuso: i conteggi originali non si modificano. Puoi correggere la giacenza con una rettifica tracciata.”**

## Ambito e verifiche
- Modifiche limitate alla finestra dello storico e al collegamento con la correzione già esistente.
- Nessuna modifica alla logica del semaforo, agli inventari, ai conteggi originali o alla Lista della Spesa.
- Verifica visiva su computer, tablet e smartphone.
- Nessuna rettifica reale e nessun dato di prova verranno creati durante i test.
