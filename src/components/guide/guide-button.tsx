import { Info } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { GUIDES, visibleSteps, type GuideKey } from "@/lib/guides/definitions";

async function startGuide(key: GuideKey) {
  const guide = GUIDES[key];
  const steps = visibleSteps(guide, (target) => {
    const el = document.querySelector(target);
    return Boolean(el && el.getClientRects().length);
  });
  if (!steps.length) {
    toast.info("Nessun elemento da mostrare in questa pagina.");
    return;
  }
  const [{ driver }] = await Promise.all([import("driver.js"), import("driver.js/dist/driver.css")]);
  const tour = driver({
    showProgress: true,
    progressText: "Passo {{current}} di {{total}}",
    nextBtnText: "Avanti",
    prevBtnText: "Indietro",
    doneBtnText: "Fine",
    allowClose: true,
    // La guida spiega soltanto: l'elemento evidenziato non è cliccabile.
    disableActiveInteraction: true,
    popoverClass: "trevi-guide",
    onPopoverRender: (popover) => {
      const skip = document.createElement("button");
      skip.type = "button";
      skip.textContent = "Salta";
      skip.className = "trevi-guide-skip";
      skip.onclick = () => tour.destroy();
      popover.footerButtons.prepend(skip);
    },
    steps: steps.map((step) => ({
      element: step.target,
      popover: {
        title: step.title,
        description: step.text,
        ...(step.id === "spesa.genera" ? { side: "top" as const, align: "center" as const } : {}),
      },
    })),
  });
  tour.drive();
}

export function GuideButton({ guide }: { guide: GuideKey }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label="Aiuto su questa pagina">
          <Info className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => window.setTimeout(() => void startGuide(guide), 50)}>Guida completa</DropdownMenuItem>
        <DropdownMenuItem>Chiudi</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
