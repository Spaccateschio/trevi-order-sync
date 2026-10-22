/** External non-B2B links must not inherit the editor's protected origin. */
const PUBLIC_ORDER_ORIGIN = 'https://trevi-order-sync.lovable.app';
const SHARE_TOKEN = /^[A-Za-z0-9_-]{10,200}$/;

export type OrderShareLink = { url: string; expiresAt: string };

export function orderShareUrl(token: string): string {
  if (!SHARE_TOKEN.test(token)) throw new Error('Codice del link non valido');
  return `${PUBLIC_ORDER_ORIGIN}/consegna/${token}`;
}

/** Reuse an existing token without issuing or revoking anything. */
export function normalizeOrderShareLink(link: OrderShareLink | null): OrderShareLink | null {
  if (!link) return null;
  try {
    const url = new URL(link.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    const match = /^\/consegna\/([A-Za-z0-9_-]{10,200})$/.exec(url.pathname);
    const token = match?.[1];
    if (!token) return null;
    return { ...link, url: orderShareUrl(token) };
  } catch {
    return null;
  }
}