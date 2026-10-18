import type { Guide } from "./definitions";
export const preparationGuide: Guide = {
  key: "preparazione",
  title: "Preparazione",
  version: 1,
  steps: [
    {
      id: "prep.elenco",
      target: '[data-tour="prep.elenco"]',
      title: "Ordini da preparare",
      text: "Ordini e clienti sono inventati. Scegli un ordine per provare la preparazione.",
      introducedIn: 1,
    },
    {
      id: "prep.filtri",
      target: '[data-tour="prep.filtri"]',
      title: "Ricerca e stati",
      text: "Filtra gli ordini per cliente, numero o avanzamento.",
      introducedIn: 1,
    },
    {
      id: "prep.preparatore",
      target: '[data-tour="prep.preparatore"]',
      title: "Preparatore",
      text: "Assegna il lavoro a un preparatore dimostrativo. Non è una collaborazione reale.",
      introducedIn: 1,
    },
    {
      id: "prep.righe",
      target: '[data-tour="prep.righe"]',
      title: "Quantità e peso",
      text: "La quantità mantiene la sua U.M. Il peso effettivo è separato, in kg. Conferma ogni riga; la matita permette di correggerla. Mancante non sostituisce il prodotto.",
      introducedIn: 1,
    },
    {
      id: "prep.voce",
      target: '[data-tour="prep.voce"]',
      title: "Dialogo vocale dimostrativo",
      text: "Prova una proposta di peso: prima di registrarlo puoi confermarlo o correggerlo. Nessun microfono viene attivato.",
      introducedIn: 1,
    },
    {
      id: "prep.pronto",
      target: '[data-tour="prep.pronto"]',
      title: "Riepilogo finale",
      text: "Dopo aver verificato tutte le righe, controlla il riepilogo e conferma l'ordine pronto. Eventuali mancanti restano evidenziati. Nessun dato raggiunge Danea.",
      introducedIn: 1,
    },
  ],
};
export async function startPreparationGuide() {
  const { driver } = await import("driver.js");
  await import("driver.js/dist/driver.css");
  const tour = driver({
    showProgress: true,
    progressText: "Passo {{current}} di {{total}}",
    nextBtnText: "Avanti",
    prevBtnText: "Indietro",
    doneBtnText: "Fine",
    disableActiveInteraction: true,
    popoverClass: "trevi-guide",
    onPopoverRender: (p) => {
      const skip = document.createElement("button");
      skip.textContent = "Salta";
      skip.className = "trevi-guide-skip";
      skip.onclick = () => tour.destroy();
      p.footerButtons.prepend(skip);
    },
    steps: preparationGuide.steps
      .filter((s) => document.querySelector(s.target)?.getClientRects().length)
      .map((s) => ({ element: s.target, popover: { title: s.title, description: s.text } })),
  });
  tour.drive();
}
