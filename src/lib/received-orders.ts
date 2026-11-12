/** Presentation scope only; database RLS remains authoritative for access. */
export function isReceivedOrder(
  order: { status: string; sellerCompanyId: string | null },
  companyId: string,
): boolean {
  return Boolean(companyId) && order.sellerCompanyId === companyId && order.status !== 'bozza';
}