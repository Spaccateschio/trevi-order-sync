/**
 * Guide interattive versionate. Ogni passaggio ha un id stabile e la versione
 * in cui è stato introdotto: servirà alla Fase 2 per mostrare solo le novità.
 * Le guide spiegano soltanto: nessun passaggio esegue azioni.
 */
export type GuideStep = {
  id: string;
  /** Selettore CSS dell'elemento da evidenziare (attributi data-tour). */
  target: string;
  title: string;
  text: string;
  introducedIn: number;
};

export type Guide = { key: string; title: string; version: number; steps: GuideStep[] };

export const GUIDES = {
  "lista-spesa": {
    key: "lista-spesa",
    title: "Lista della Spesa",
    version: 1,
    steps: [
      { id: "spesa.titolo", target: '[data-tour="pagina.titolo"]', introducedIn: 1, title: "Lista della Spesa", text: "Qui decidi cosa comprare. Il fabbisogno suggerito e la quantità che ordini davvero restano due numeri distinti." },
      { id: "spesa.banner-ordini", target: '[data-tour="spesa.banner-ordini"]', introducedIn: 1, title: "Ordini inviati", text: "Questo avviso ricorda gli ordini inviati di recente ai fornitori." },
      { id: "spesa.data", target: '[data-tour="spesa.data"]', introducedIn: 1, title: "Per quando serve", text: "Il giorno in cui serve la merce. Con «Cambia» scegli un altro giorno." },
      { id: "spesa.annulla", target: '[data-tour="spesa.annulla"]', introducedIn: 1, title: "Annulla lista", text: "Annulla la lista aperta. Prima di farlo ti viene sempre chiesta conferma." },
      { id: "spesa.bozze", target: '[data-tour="spesa.bozze"]', introducedIn: 1, title: "Bozze", text: "Qui ritrovi gli ordini preparati e non ancora inviati." },
      { id: "spesa.storico", target: '[data-tour="spesa.storico"]', introducedIn: 1, title: "Storico liste", text: "Le liste passate, già chiuse o annullate, da consultare e stampare." },
      { id: "spesa.nuova-lista", target: '[data-tour="spesa.nuova-lista"]', introducedIn: 1, title: "Nuova lista", text: "Crea una lista straordinaria, non collegata all'inventario." },
      { id: "spesa.orario", target: '[data-tour="spesa.orario"]', introducedIn: 1, title: "Giorni e orario", text: "I giorni e l'orario del promemoria per preparare la lista. «Cambia orario» lo sposta solo per oggi; i giorni si cambiano in Azienda → Preferenze." },
      { id: "spesa.ricerca", target: '[data-tour="spesa.ricerca"]', introducedIn: 1, title: "Cerca un prodotto", text: "Scrivi il nome o il codice per trovare subito un prodotto nella lista." },
      { id: "spesa.preferiti", target: '[data-tour="spesa.preferiti"]', introducedIn: 1, title: "★ Preferiti", text: "All'ingresso vedi solo i prodotti preferiti. Toccalo per vedere anche gli altri." },
      { id: "spesa.filtri", target: '[data-tour="spesa.filtri"]', introducedIn: 1, title: "Filtri", text: "Restringi l'elenco per categoria, tipo di prodotto (B2B o non B2B) e stato." },
      { id: "spesa.contatori", target: '[data-tour="spesa.contatori"]', introducedIn: 1, title: "Contatori", text: "Quanti prodotti sono in lista, quanti hanno già la quantità e quanti mancano." },
      { id: "spesa.aggiungi", target: '[data-tour="spesa.aggiungi"]', introducedIn: 1, title: "Aggiungi prodotti", text: "Aggiunge alla lista prodotti che oggi non ci sono." },
      { id: "spesa.card", target: '[data-tour="spesa.card"] > *:first-child', introducedIn: 1, title: "La card del prodotto", text: "Inserisci quantità e unità di misura, poi conferma: la card si blocca. Con la matita la sblocchi per correggerla." },
      { id: "spesa.genera", target: '[data-tour="spesa.genera"]', introducedIn: 1, title: "Genera ordini", text: "Quando le quantità sono pronte, da qui prepari gli ordini. Prima vedrai sempre un riepilogo da controllare." },
    ],
  },
  inventario: {
    key: "inventario",
    title: "Inventario",
    version: 1,
    steps: [
      { id: "inv.titolo", target: '[data-tour="pagina.titolo"]', introducedIn: 1, title: "Inventario", text: "Qui conti la merce presente in magazzino, zona per zona. La giacenza calcolata resta sempre visibile." },
      { id: "inv.banner-ordini", target: '[data-tour="spesa.banner-ordini"]', introducedIn: 1, title: "Ordini inviati", text: "Questo avviso ricorda gli ordini inviati di recente ai fornitori." },
      { id: "inv.schede", target: '[data-tour="inv.schede"]', introducedIn: 1, title: "Conteggio, Fabbisogno, Zone", text: "Conteggio per contare, Fabbisogno per vedere cosa serve, Zone per le zone del magazzino." },
      { id: "inv.nuovo", target: '[data-tour="inv.nuovo"]', introducedIn: 1, title: "Nuovo conteggio", text: "Avvia un nuovo inventario. Lo può fare solo un amministratore." },
      { id: "inv.stampa", target: '[data-tour="inv.stampa"]', introducedIn: 1, title: "Stampa", text: "Stampa l'inventario in corso, o l'ultimo chiuso, con i filtri attivi oppure completo." },
      { id: "inv.storico", target: '[data-tour="inv.storico"]', introducedIn: 1, title: "Storico inventari", text: "Gli inventari passati, da consultare." },
      { id: "inv.ricerca", target: '[data-tour="inv.ricerca"]', introducedIn: 1, title: "Cerca un prodotto", text: "Scrivi il nome o il codice: cerca in tutto il conteggio, anche fuori dai filtri." },
      { id: "inv.filtri", target: '[data-tour="inv.filtri"]', introducedIn: 1, title: "Preferiti e filtri", text: "All'ingresso vedi solo i Preferiti. Tocca «Tutti» o usa i filtri per vedere altri prodotti." },
      { id: "inv.card", target: '[data-tour="inv.card"] > *:first-child', introducedIn: 1, title: "La card del prodotto", text: "Scrivi la quantità contata e conferma: la card si blocca. Con la matita la sblocchi per correggerla." },
      { id: "inv.conferma", target: '[data-tour="inv.conferma"]', introducedIn: 1, title: "Conferma inventario", text: "Quando hai finito, conferma qui: vengono controllate tutte le card della sessione, anche quelle non visibili." },
    ],
  },
} satisfies Record<string, Guide>;

export type GuideKey = keyof typeof GUIDES;

/** Passaggi da mostrare: solo quelli il cui elemento è presente nella pagina. */
export function visibleSteps(guide: Guide, isPresent: (target: string) => boolean, sinceVersion = 0) {
  return guide.steps.filter((step) => step.introducedIn > sinceVersion && isPresent(step.target));
}
