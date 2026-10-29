import { useEffect } from "react";

// Su cellulare, quando si scrive in un campo, la tastiera fa "salire" le barre fisse
// in basso (comandi e menu). Per tenere ferma la struttura le barre marcate con
// data-hide-on-keyboard vengono nascoste mentre la tastiera è aperta e ricompaiono
// appena si chiude, senza spostare nulla.
const TEXT_INPUT_TYPES = new Set(["", "text", "search", "number", "tel", "email", "url", "password", "decimal"]);

function isTextEntry(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
  if (element instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(element.type) && !element.readOnly && !element.disabled;
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

export function useMobileKeyboardFlag(): void {
  useEffect(() => {
    if (!window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (isTextEntry(document.activeElement)) root.setAttribute("data-keyboard-open", "");
      else root.removeAttribute("data-keyboard-open");
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    update();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      root.removeAttribute("data-keyboard-open");
    };
  }, []);
}
