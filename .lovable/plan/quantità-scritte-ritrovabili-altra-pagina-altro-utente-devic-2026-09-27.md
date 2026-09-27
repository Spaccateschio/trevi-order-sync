# Quantità scritte ritrovabili (altra pagina, altro utente, device spento)

## Come funziona oggi
- **Con un inventario aperto** (in alto "Inventario generale"): ogni quantità scritta viene salvata come bozza circa 1 secondo dopo che smetti di scrivere, e compare la scritta "Bozza salvata". Le bozze sono dell'azienda, non del singolo telefono, quindi:
  - cambi pagina e torni → ritrovi le quantità;
  - il device si spegne → ritrovi tutto tranne l'ultimo secondo di scrittura;
  - un altro utente della stessa azienda, da un altro device → vede le stesse quantità quando apre o ricarica la pagina.
- **Senza inventario aperto** (in alto "Conteggio pronto 0 / 0", come nella tua schermata): le quantità restano solo sullo schermo. Se cambi pagina o il device si spegne, **si perdono**. È questo il caso da sistemare.

## Cosa propongo
1. **La prima quantità scritta apre l'inventario in automatico.** Oggi l'inventario si apre solo alla prima "Conferma". Con la modifica, appena scrivi un numero o premi +1/+3/+5/+10 (in bozza, senza confermare nulla), l'inventario generale si apre e la quantità viene salvata subito come bozza. Da lì valgono le regole di sopra.
   - Può aprire l'inventario solo un amministratore, come oggi. Un operatore senza inventario aperto vede l'avviso "Chiedi a un amministratore di aprire l'inventario" e non può scrivere quantità che poi andrebbero perse.
2. **Aggiornamento dall'altro device.** Quando torni sulla pagina o riattivi la finestra, le bozze vengono ricaricate, così vedi anche quelle scritte da un collega senza dover ricaricare a mano. Una quantità che stai scrivendo tu in quel momento non viene sovrascritta.
3. **Salvataggio prima di uscire.** Se cambi pagina entro il secondo di attesa, la bozza in sospeso viene salvata subito invece di andare persa.

Restano invariati: conferma, differenze e note, U.M., Fabbisogno, Lista della Spesa e storico. Una bozza non è mai un conteggio: non conta come "contato" e non diventa giacenza.

## Dettagli tecnici
- File: solo `src/components/inventory/inventory-count-panel.tsx`.
- Punto 1: in `onDraftChange` senza `sessionId`, se `isAdmin` chiama `startMutation` una sola volta (con un blocco contro le doppie aperture) e, a sessione creata, sposta `draftFirst` in `drafts` e chiama `scheduleDraftSave`. Il `setProductView("favorites")` e il reset dei filtri in `onSuccess` non devono cancellare la bozza appena scritta (non azzerare `drafts` in questo percorso). Se l'utente non è amministratore, il campo è disattivato e compare l'avviso.
- Punto 2: `savedDraftsQuery` con `refetchOnWindowFocus: true` e `refetchOnMount: "always"`. Nel merge, i valori della bozza server sovrascrivono quelli locali solo se per quella chiave non c'è un salvataggio in sospeso (`draftTimers.current[key]`) e il campo non ha il focus.
- Punto 3: nel cleanup di smontaggio e su `pagehide`/`visibilitychange=hidden`, invia subito le bozze con timer ancora attivo invece di annullarle.
- Nessuna modifica al database, alle funzioni server o ai permessi.
- Prove: scrivo 2 quantità senza inventario aperto → l'inventario si apre e compare "Bozza salvata"; cambio pagina e torno → le ritrovo; ricarico subito dopo aver scritto → le ritrovo; seconda sessione (altro "device") vede le stesse quantità dopo il focus; nessun conteggio registrato.
