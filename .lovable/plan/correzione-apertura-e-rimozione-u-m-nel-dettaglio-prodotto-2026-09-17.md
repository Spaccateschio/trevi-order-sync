# Correzione apertura e rimozione U.M. nel dettaglio prodotto

## Obiettivo
Correggere esclusivamente l’interazione delle U.M. nel dettaglio prodotto, mantenendo le U.M. in alto e i Dati Danea richiudibili.

## Modifiche
- Il primo clic su una U.M. apre il relativo editor con i valori già salvati.
- Il secondo clic sulla stessa U.M. richiude soltanto l’editor, senza richieste di conferma e senza modificare dati.
- Nell’editor restano visibili e modificabili: Attiva, Visibile cliente, Predefinita, conversione stimata, riferimento alla U.M. Danea e Salva.
- Aggiungere nell’editor il comando separato **Rimuovi U.M.**.
- Solo **Rimuovi U.M.** apre la conferma di rimozione; se l’associazione è storicizzata o non eliminabile, resta il passaggio già previsto alla disattivazione.
- Il pulsante `+`, le U.M. in alto e la sezione Dati Danea richiudibile restano invariati.

## Verifica dati
- CICORIA mantiene senza riscrittura `cs` predefinita, attiva e visibile, con conversione salvata `1 cs ≈ 15 kg`.
- Le associazioni attuali `kg`, `cs`, `ct` e `mz` restano tutte invariate.

## Test
- Aprire CICORIA e verificare i pulsanti `kg`, `cs ★`, `ct`, `mz` e `+`.
- Aprire `cs` e verificare che l’editor mostri `1 cs ≈ 15 kg` e tutti i controlli.
- Cliccare nuovamente `cs`: l’editor si chiude senza richieste e senza scritture.
- Riaprire `cs` e verificare nuovamente il valore `15`.
- Ricaricare la pagina, riaprire CICORIA e verificare che `15` sia ancora presente.
- Verificare separatamente che **Rimuovi U.M.** apra la conferma senza confermarla.
- Ripetere i controlli principali su desktop e smartphone.

## Ambito invariato
Nessuna modifica a database, conversioni salvate, regole U.M., import Danea, archivi, autenticazione o altri moduli.
