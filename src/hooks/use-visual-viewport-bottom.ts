import { useEffect, useState } from "react";

// Su iOS la barra fissa in basso "salta" quando la barra degli indirizzi si apre/chiude
// o quando appare la tastiera: position: fixed segue il viewport di layout, non quello
// visibile. Questo offset riporta la barra sul bordo inferiore realmente visibile.
export function useVisualViewportBottom(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const next = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      setOffset((current) => (current === next ? current : next));
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return offset;
}
