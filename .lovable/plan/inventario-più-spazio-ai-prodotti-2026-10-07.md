# Inventario: più spazio ai prodotti

## Struttura finale

```text
Inventario
Conteggio | Fabbisogno | Zone

INVENTARIO GENERALE 04/10/2026
● In corso                    0/6
──────── avanzamento ─────────
0 confermati · 0 differenze · 6 mancanti

Cerca prodotto o codice

★ Preferiti | Tutti | Azzera quantità | Tutti gli stati | Altri stati ▼
Filtri | Colonne | Stampa giacenze

[prodotti]
```

Su smartphone:

```text
★ Preferiti | Tutti | Azzera | Tutti gli stati
Altri stati ▼ | Filtri | Colonne | Stampa
```

## Modifiche proposte
1. **Un solo riepilogo, legato allo stato del ciclo**: «In corso», «Completato», rosso/bloccato e gli altri stati restano con il loro testo breve e le azioni già previste oggi (Vai alla Lista, Visualizza, Modifica conteggio, Azzera quantità, Sblocca quantità), ma dentro lo stesso riquadro di «Inventario generale».
2. **Stampa con gli strumenti della vista**: «Stampa giacenze» si sposta accanto a «Filtri» e «Colonne»; niente più riga dedicata.
3. **Barra degli stati**: «★ Preferiti», «Tutti», «Azzera quantità», «Tutti gli stati» (filtro neutro predefinito) e menu «Altri stati» con Da controllare, Confermati, Differenze, U.M. diverse e Da ricontare. A menu chiuso il filtro attivo si legge sul pulsante, per esempio «Altri stati: Differenze».
4. **Due gruppi distinti**: stati («cosa sto vedendo») e Filtri | Colonne | Stampa («strumenti della vista») sono separati visivamente. «Da ricordare» è inteso come l'attuale «Da ricontare».
5. **Eliminare i doppioni**: togliere il blocco «Tutto l'inventario» con i contatori già nel riepilogo e il testo esplicativo sotto Filtri/Colonne. Con una zona o categoria scelta resta una breve indicazione con nome e avanzamento.
6. La barra compatta che compare scorrendo usa la stessa logica: niente stati tutti in fila.

## Ambito e salvaguardie
- Solo disposizione e presentazione della pagina Inventario; nessuna regola cambiata.
- Banner ordini, card prodotto, quantità, permessi, semaforo, Lista della Spesa, Fabbisogno, Zone e database invariati.
- «Azzera quantità» mantiene comportamento e conferme attuali.

## File autorizzati
- `src/components/inventory/inventory-count-panel.tsx`
- `roadmap.md` (solo questa attività)

Nessuna modifica agli stili globali.

## Verifica
- Misura prima/dopo: la prima riga di card deve iniziare almeno 100–150 px più in alto.
- Computer e smartphone: tutti i comandi raggiungibili, nessun testo sovrapposto o tagliato.
- Menu «Altri stati» (con etichetta del filtro attivo), Filtri, Colonne e Stampa funzionanti.
- Stati in corso / completato rosso con le loro azioni nel riepilogo, senza modificare dati reali.
- Riepilogo finale con esito, file toccati e righe modificate.
