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
      { id: "spesa.ricerca", target: '[data-tour="spesa.ricerca"]', introducedIn: 1, title: "Cerca un prodotto", text: "Scrivi il nome o il codice per trovare subito un prodotto nella lista." },
      { id: "spesa.preferiti", target: '[data-tour="spesa.preferiti"]', introducedIn: 1, title: "★ Preferiti", text: "All'ingresso vedi solo i prodotti preferiti. Toccalo per vedere anche gli altri." },
      { id: "spesa.filtri", target: '[data-tour="spesa.filtri"]', introducedIn: 1, title: "Filtri", text: "Restringi l'elenco per categoria, tipo di prodotto (B2B o non B2B) e stato." },
      { id: "spesa.contatori", target: '[data-tour="spesa.contatori"]', introducedIn: 1, title: "Contatori", text: "Quanti prodotti sono in lista, quanti hanno già la quantità e quanti mancano." },
      { id: "spesa.aggiungi", target: '[data-tour="spesa.aggiungi"]', introducedIn: 1, title: "Aggiungi prodotti", text: "Aggiunge alla lista prodotti che oggi non ci sono." },
      { id: "spesa.card", target: '[data-tour="spesa.card"] > *:first-child', introducedIn: 1, title: "La card del prodotto", text: "Inserisci quantità e unità di misura, poi conferma: la card si blocca. Con la matita la sblocchi per correggerla." },
      { id: "spesa.genera", target: '[data-tour="spesa.genera"]', introducedIn: 1, title: "Genera ordini", text: "Quando le quantità sono pronte, da qui prepari gli ordini. Prima vedrai sempre un riepilogo da controllare." },
    ],
  },
} satisfies Record<string, Guide>;

export type GuideKey = keyof typeof GUIDES;

/** Passaggi da mostrare: solo quelli il cui elemento è presente nella pagina. */
export function visibleSteps(guide: Guide, isPresent: (target: string) => boolean, sinceVersion = 0) {
  return guide.steps.filter((step) => step.introducedIn > sinceVersion && isPresent(step.target));
}
