# Rifiniture e verifiche della guida — solo Fase 1

La Fase 2 resta sospesa. Nessuna pubblicazione, modifica al database o ai dati operativi.

## Intervento
- Migliorare sullo smartphone l'evidenziazione della barra «Genera ordini» durante la guida, senza cambiare il pulsante o la generazione degli ordini.
- Verificare nell'anteprima che «Salta» sia distinguibile da «Avanti/Fine» e chiuda correttamente la guida.
- Verificare il passaggio del banner solo se presente naturalmente. Non creare, inviare o modificare ordini per farlo comparire; se assente, lasciare esplicitamente la verifica in attesa.
- Ripetere i quattro test esistenti e le verifiche in sola lettura su smartphone e computer. La prova personale di Andrea sul telefono resta necessaria prima della Fase 2.

## Controllo dei file di istruzioni
Controllare in sola lettura lo storico di `AGENTS.md`, `roadmap.md` e delle istruzioni locali, distinguendo aggiunte, trasferimenti e rimozioni. Segnalare eventuali deviazioni; non correggerle in questo intervento.

## File modificabili dopo approvazione
- `src/components/guide/guide-button.tsx`: solo configurazione e comportamento visivo della guida.
- `src/styles.css`: solo evidenziazione e comandi della guida.

Nessuna modifica ad `AGENTS.md`, `roadmap.md`, definizioni dei passaggi, Lista della Spesa o logiche operative. Script e schermate di verifica restano temporanei.

## Esito da comunicare
Rifinitura della barra, risultato di «Salta», banner verificato oppure in attesa, test superati e modifiche effettive con file e righe. Non avviare la Fase 2.