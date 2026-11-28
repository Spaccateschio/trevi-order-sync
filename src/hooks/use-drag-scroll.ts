import { useRef } from 'react';

/** Scorrimento trascinando con il tasto sinistro del mouse; il dito usa lo scorrimento nativo. Un trascinamento non apre la riga. */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const drag = useRef<{ y: number; top: number; moved: boolean } | null>(null);
  return {
    ref,
    onPointerDown: (e: React.PointerEvent<T>) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !ref.current) return;
      drag.current = { y: e.clientY, top: ref.current.scrollTop, moved: false };
    },
    onPointerMove: (e: React.PointerEvent<T>) => {
      const d = drag.current;
      if (!d || !ref.current) return;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dy) > 5) { d.moved = true; ref.current.setPointerCapture(e.pointerId); }
      if (d.moved) { e.preventDefault(); ref.current.scrollTop = d.top - dy; }
    },
    onPointerUp: () => { setTimeout(() => { drag.current = null; }, 0); },
    onClickCapture: (e: React.MouseEvent<T>) => { if (drag.current?.moved) { e.preventDefault(); e.stopPropagation(); } drag.current = null; },
  };
}
