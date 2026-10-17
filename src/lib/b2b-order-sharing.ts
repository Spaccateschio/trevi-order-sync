const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sharedOrderId(value: unknown): string | undefined {
  return typeof value === 'string' && UUID.test(value) ? value : undefined;
}

/** The public login entry preserves the order even when the managed gate redirects. */
export function b2bOrderShareUrl(origin: string, orderId: string): string {
  const id = sharedOrderId(orderId);
  if (!id) throw new Error('Ordine non valido');
  const url = new URL('/auth', origin);
  url.searchParams.set('ordineB2b', id);
  return url.toString();
}

export function canReshareOrder(status: string): boolean {
  return ['inviato', 'parzialmente_consegnato', 'consegnato', 'chiuso'].includes(status);
}

export function b2bShareHref(channel: 'email' | 'whatsapp', url: string, number: string) {
  const text = encodeURIComponent(`Ordine ${number}\n${url}`);
  return channel === 'email'
    ? `mailto:?subject=${encodeURIComponent(`Ordine ${number}`)}&body=${text}`
    : `https://wa.me/?text=${text}`;
}

/** Authorization is supplied by is_order_supplier in the database, not by local identity. */
export async function readSupplierOrder<T>(
  orderId: string,
  authorize: (id: string) => Promise<boolean>,
  read: (id: string) => Promise<T | null>,
): Promise<T | null> {
  const id = sharedOrderId(orderId);
  if (!id || !(await authorize(id))) return null;
  return read(id);
}