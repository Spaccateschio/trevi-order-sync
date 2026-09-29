# Stato bloccato delle schede dell’ultimo inventario

## Regola visiva
- Una scheda con quantità già confermata, quando l’ultimo inventario è chiuso, usa uno sfondo **giallo ocra leggero** e leggibile.
- In questo stato la scheda è interamente non operativa: l’unico comando che permette di intervenire è il pulsante generale **Sblocca quantità** sopra l’elenco.
- Dopo **Sblocca quantità**, la scheda torna al colore normale attuale.
- Durante un nuovo inventario o su una quantità ancora da inserire/confermare, la scheda resta sempre del colore normale.

## Controlli realmente presenti nella scheda

### 1. Bloccati prima di “Sblocca quantità”
Saranno disabilitati tutti i controlli che reagiscono a un’azione:
- campo **Quantità fisica** e matita;
- selettore U.M., se presente;
- `+1`, `+3`, `+5`, `+10`, Azzera e Conferma;
- Preferito (stella);
- andamento prezzo (€);
- menu `⋮` completo;
- nota della differenza, se presente.

Le informazioni restano leggibili, ma nessun controllo interno alla scheda risponde al clic.

### 2. Riattivati dopo “Sblocca quantità”
Tornano utilizzabili i comandi compatibili con un inventario chiuso:
- Quantità fisica, matita, incrementi, Azzera e Conferma: salvano la correzione tramite la rettifica tracciata già esistente, senza riscrivere il conteggio storico;
- Preferito;
- andamento prezzo;
- nota della differenza in consultazione;
- nel menu `⋮`: **Proponi per l’acquisto**, **Storico dei controlli**, **Apri prodotto → Acquisto**.

### 3. Non riattivabili sull’inventario chiuso
Restano disabilitati anche dopo lo sblocco:
- **Segna da ricontare**;
- **Segnala/Revoca non conforme**;
- cambio dell’U.M. del conteggio storico.

Motivo: queste azioni oggi scrivono nuove righe dentro una sessione d’inventario aperta. Riattivarle sull’inventario chiuso richiederebbe una nuova logica dati e violerebbe il vincolo di non modificare lo storico chiuso. Non verrà inventato alcun comportamento sostitutivo.

## Implementazione
- Coordinare lo stato globale **Sblocca quantità** con tutti i controlli delle schede.
- Fare in modo che incrementi, Azzera e Conferma lavorino sulla stessa quantità fisica mostrata nella cella esistente.
- Usare i token colore già presenti per ottenere l’ocra, senza colori inseriti direttamente nella scheda.
- Non modificare database, funzioni server, semaforo, Lista della Spesa, Fabbisogno o storico.

## File interessati
- `src/components/inventory/inventory-count-panel.tsx`
- `src/components/inventory/physical-quick-edit.tsx`
- `src/styles.css` solo se manca un token semantico ocra adatto; nessun altro file.

## Verifica senza dati reali
- Alla larghezza dello screenshot: sei schede ocra e tutti i comandi interni inattivi prima dello sblocco.
- Dopo **Sblocca quantità**: colore normale e attivazione dei soli controlli elencati al punto 2.
- Verificare incrementi, Azzera e Conferma senza completare alcun salvataggio.
- Verificare che Riconta, Non conforme e cambio U.M. restino indisponibili.
