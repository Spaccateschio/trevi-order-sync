# Correzione scarico ordini in Danea

## Cosa è successo
- Danea ha chiamato l'indirizzo due volte (08:13 e 08:17) con login e password giusti.
- Entrambe le volte Trevi Fruit ha consegnato ORD-2026-00004 e lo ha segnato «Scaricato da Danea».
- Danea però mostra la lista vuota.

## Causa
La documentazione ufficiale Danea (ricezione ordini) dice:
- ogni ordine deve avere un **Numero** (solo cifre): Danea lo usa per mostrare l'ordine nella lista e per ricordare «l'ultimo ordine già importato»;
- Danea aggiunge all'indirizzo i filtri `firstdate`, `lastdate`, `firstnum`, `lastnum`.

Il nostro file **non mette il Numero** (scelta fatta per lasciare a Danea la sua numerazione): Danea scarta l'ordine e la lista resta vuota.

## Correzioni
1. **Numero ordine nel file**: la parte numerica del numero Trevi Fruit (ORD-2026-00004 → `4`). Il numero completo resta nelle note interne.
2. **Rispetto dei filtri di Danea**: anno/date e intervallo di numeri richiesti da Danea vengono applicati.
3. **Segnato «Scaricato» con più prudenza**: l'ordine resta riscaricabile se Danea lo richiede esplicitamente per numero (es. dopo aver chiuso la finestra senza importare). Protezione doppioni resta: in Danea lo stesso numero non viene reimportato.
4. Test aggiornati per Numero e filtri.

## Dopo la correzione (con tuo permesso)
- «Rimetti in scarico» su ORD-2026-00004 (unica scrittura sui dati).
- Pubblicazione, poi tua prova da Danea.

## Punto da decidere
In Danea, nel campo «Numeraz. nuovi documenti», conviene scegliere una numerazione dedicata (es. «/W») così l'ordine n. 4 di Trevi Fruit non si confonde con gli ordini già numerati in Danea.

## Dettagli tecnici
- `src/lib/danea-orders-xml.ts`: `<Number>` numerico estratto da `ORD-YYYY-NNNNN`.
- `src/routes/api/public/danea/orders.ts` + `src/lib/danea-orders-export.server.ts`: lettura `firstdate/lastdate/firstnum/lastnum`, filtro sui candidati; con `firstnum/lastnum` inclusi anche gli ordini già scaricati della stessa postazione.
- `src/lib/danea-orders-xml.test.ts`: nuovi test.
- Nessuna modifica al database salvo l'eventuale «Rimetti in scarico» autorizzato.
