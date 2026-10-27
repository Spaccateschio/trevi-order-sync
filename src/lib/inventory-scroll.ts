/** Document-space marker and fixed sticky inset are independent of header height. */
export function inventoryCompactBar(current: boolean, scrollY: number, markerY: number, stickyInset: number) {
  const distance = scrollY + stickyInset - markerY;
  return current ? distance > 4 : distance > 24;
}