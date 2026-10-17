import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b2bOrderShareUrl, b2bShareHref, canReshareOrder, readSupplierOrder, sharedOrderId } from './b2b-order-sharing';

const id = '0c168700-f013-4493-987b-c7844b9b38c3';
test('login entry retains the specific B2B order without external redirect input', () => {
  const url = new URL(b2bOrderShareUrl('https://example.test', id));
  assert.equal(url.pathname, '/auth');
  assert.equal(url.searchParams.get('ordineB2b'), id);
  assert.equal(url.origin, 'https://example.test');
  assert.equal(sharedOrderId('https://evil.test'), undefined);
  assert.throws(() => b2bOrderShareUrl('https://example.test', '//evil.test'));
});
test('sent and progressed orders can be reshared, drafts and cancelled cannot', () => {
  for (const status of ['inviato','parzialmente_consegnato','consegnato','chiuso']) assert.equal(canReshareOrder(status), true);
  for (const status of ['bozza','annullato','unknown']) assert.equal(canReshareOrder(status), false);
});
test('unauthorized supplier never reads even buyer-visible order data', async () => {
  let reads = 0;
  const result = await readSupplierOrder(id, async () => false, async () => { reads++; return { number: 'ORD-2026-00004' }; });
  assert.equal(result, null);
  assert.equal(reads, 0);
});
test('authorized supplier reads the requested existing order exactly once', async () => {
  const calls: string[] = [];
  const result = await readSupplierOrder(id, async requested => { calls.push(`authorize:${requested}`); return true; }, async requested => { calls.push(`read:${requested}`); return { id: requested }; });
  assert.deepEqual(result, { id });
  assert.deepEqual(calls, [`authorize:${id}`, `read:${id}`]);
});
test('missing and invalid orders return no data', async () => {
  assert.equal(await readSupplierOrder(id, async () => true, async () => null), null);
  assert.equal(await readSupplierOrder('invalid', async () => { throw new Error('must not run'); }, async () => ({ id })), null);
});
test('B2B channels carry only the existing order link, no delivery token', () => {
  const url = b2bOrderShareUrl('https://example.test', id);
  const email = b2bShareHref('email', url, 'ORD-2026-00004');
  assert.equal(new URL(email).searchParams.get('body'), `Ordine ORD-2026-00004\n${url}`);
  assert.equal(new URL(b2bShareHref('whatsapp', url, 'ORD-2026-00004')).searchParams.get('text'), `Ordine ORD-2026-00004\n${url}`);
  assert.equal(url.includes('/consegna/'), false);
});