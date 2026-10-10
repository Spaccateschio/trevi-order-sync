# Inventario — barra fissa di conferma

## Individuazione
- Il pulsante reale è in `src/components/inventory/inventory-count-panel.tsx`, righe 2859–2868, insieme all'indicazione della bozza salvata.
- L'elenco scorre con la pagina: la barra sarà fissa rispetto alla finestra, non vincolata alla fine dell'elenco.
- Su smartphone esiste già una navigazione inferiore alta 64 px, più l'area di sicurezza del dispositivo. La barra si posizionerà sopra questa navigazione; su desktop resterà in basso senza coprire il menu laterale.

## Intervento
1. Spostare visivamente il comando esistente in una barra fissa chiara con bordo superiore e altezza contenuta, mantenendo anche l'eventuale indicazione della bozza.
2. Un solo pulsante: testo, azione, condizioni e permessi identici. Allineamento a destra su desktop; larghezza disponibile su smartphone.
3. Riservare spazio dopo l'elenco per non coprire le ultime card.
4. Tenere la barra sotto finestre e notifiche, rispettando i livelli esistenti.

## File autorizzati
- `src/components/inventory/inventory-count-panel.tsx`: solo posizione della barra, disposizione e spazio finale.
- `roadmap.md`: registrazione e chiusura dell'attività.

Nessuna modifica alla vecchia demo, agli stili globali, alle funzioni, al database o alle migrazioni. Nessuna pubblicazione.

## Verifiche
- Screenshot prima/dopo a 1280 e 390 px, con scorrimento e controllo delle ultime card.
- Unico pulsante visibile, nessuna uscita dallo schermo o sovrapposizione alla navigazione; controllo delle finestre senza confermare inventari reali.
- Verifica degli esiti automatici di compilazione e controllo TypeScript dell'anteprima. Non eseguire manualmente compilazioni o typecheck, come richiesto dall'ambiente.
- Riepilogo dei file e delle righe modificate; indicare eventuali verifiche non disponibili senza creare dati reali.
