/**
 * Scorrimento minimo per una card appena aperta: il titolo resta sotto la barra fissa.
 * Se la card è già interamente visibile, la pagina non si muove.
 */
export function openedCardScrollDelta(cardTop: number, cardBottom: number, visibleTop: number, visibleBottom: number) {
  if (cardTop >= visibleTop && cardBottom <= visibleBottom) return 0;
  return cardTop - visibleTop;
}
