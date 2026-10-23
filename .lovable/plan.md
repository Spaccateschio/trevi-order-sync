# Correzioni dopo il collaudo — consegne e acquisto diretto

## Risultato previsto

1. **Avviso rosso comprensibile.** Spiegare se il fornitore arriva dopo la data richiesta per il preavviso, per un giorno non servito oppure per entrambi, mantenendo la prima consegna possibile e senza bloccare gli acquisti.
   - Caso Barone: Lista per venerdì 23/10/2026, tutti i giorni attivi, preavviso 2 giorni → «preavviso 2 giorni: prima consegna domenica 25/10».
2. **Giorni sempre visibili.** Nella scheda Prodotto → Acquisto mostrare, anche a fornitore chiuso, «Consegna: [giorni] · preavviso N gg» e l’origine del calendario: fornitore oppure eccezione del prodotto. Senza preavviso indicare «nessun preavviso»; nessun calendario significa «tutti i giorni». Un tocco sul riepilogo apre la modifica esistente, senza salvare. Aggiungere lo stesso riepilogo compatto sotto ogni fornitore nella card della Lista.
3. **Acquisto diretto con stella.** Rendere la stella piena e dello stesso colore/dimensione delle stelle fornitore. Usare la proposta già calcolata per mostrarlo spuntato, come le altre destinazioni con stella, senza creare quote, inserire quantità o avviare un salvataggio. Conservare la possibilità di modificare esplicitamente la scelta senza confondere una proposta con una quota salvata.
4. **Nessun calendario.** Conservare la regola già presente e verificata: tutti i giorni disponibili, conta solo il preavviso. Nessuna riscrittura dei calendari.

## Ambiguità e rischi rilevati

- La proposta dell’acquisto diretto arriva già alla card, ma la spunta considera solo una quota salvata o la modifica in corso: correggere la presentazione, non le assegnazioni.
- Il messaggio deve distinguere due casi indipendenti: il preavviso minimo supera la data richiesta; la data richiesta non è servita dal calendario effettivo. Mostrare entrambi quando entrambi valgono.
- Per AZ.AGR.FUSCO TOMMASO verificare soltanto le U.M. acquistabili già presenti su 3 EMME: se mancano, segnalarlo separatamente. Nessuna U.M. inventata né configurazione modificata.

## File autorizzati per l’implementazione

- `src/lib/delivery-schedule.ts`: piccoli helper puri condivisi per riepilogo e motivi del ritardo; conservare le regole di calcolo esistenti.
- `src/lib/delivery-schedule.test.ts`: prove concrete per Barone (23→25 ottobre), solo giorno non servito, entrambe le cause e calendario vuoto con/senza preavviso.
- `src/components/products/product-suppliers-manager.tsx`: riepilogo visibile e apertura della modifica esistente.
- `src/components/shopping/card-suppliers.tsx`: riepiloghi, motivi dell’avviso, stella e spunta visiva dell’acquisto diretto.
- `src/lib/list-preselection.test.ts`: regressione sulla proposta con due fornitori stellati e acquisto diretto stellato, senza quote automatiche.
- `AGENTS.md`: aggiornare soltanto la regola tecnica della proposta visiva, se necessaria.

Nessun altro file applicativo sarà modificato senza un aggiornamento approvato del piano.

## Verifiche e screenshot

- Eseguire le prove mirate di consegna e presele­zione; verificare i segnali della compilazione automatica.
- In anteprima autenticata, leggere soltanto il prodotto **0288 ALLORO IT A MAZZI di 3 EMME ROMA SRL**. Controllare card Lista e scheda Acquisto su telefono e computer.
- Aprire il riepilogo dei giorni senza premere «Salva giorni», cambiare stelle, confermare quantità o generare ordini. Controllare che proposta e spunta non causino scritture.
- Se i dati attuali non permettono uno scenario, provarne il calcolo con test isolati e dichiarare il limite della verifica visiva, senza alterare dati.
- Consegnare uno screenshot della card Lista e uno della scheda Acquisto dopo le correzioni; comunicare file toccati e righe cambiate.

## Limiti

**Nessuna modifica al database, agli ordini o a roadmap.md; nessun invio e nessuna pubblicazione.** Non toccare Trevi né altre aziende. U.M. dell’acquisto diretto ancora solo anteprima locale. La pagina separata di anteprima resta invariata.
