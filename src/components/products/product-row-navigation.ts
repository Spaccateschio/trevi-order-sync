export function adjacentProduct<T extends { id: string }>(
  products: readonly T[],
  activeId: string | null,
  direction: -1 | 1,
  pageSize: number,
  showAll: boolean,
): { product: T; page: number } | null {
  const currentIndex = products.findIndex((product) => product.id === activeId);
  const nextIndex = currentIndex < 0
    ? direction === 1 ? 0 : products.length - 1
    : currentIndex + direction;
  const product = products[nextIndex];
  if (!product) return null;
  return { product, page: showAll ? 0 : Math.floor(nextIndex / Math.max(1, pageSize)) };
}