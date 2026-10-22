import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrderShareLink, orderShareUrl } from './order-share-url';
import { shareHref } from './order-sharing';

const token = 'demo_supplier-token_123';
const expected = `https://trevi-order-sync.lovable.app/consegna/${token}`;
const expiresAt = '2026-10-25T06:53:00Z';

test('new external links always use the public site, without browser origin', () => {
  assert.equal(orderShareUrl(token), expected);
});

test('existing preview links retain the exact token and expiry without mutating the source', () => {
  for (const origin of [
    'https://c19c798b-28ff-477b-b966-6d54b0d84389.lovableproject.com',
    'https://id-preview--c19c798b-28ff-477b-b966-6d54b0d84389.lovable.app',
    'http://localhost:8080',
  ]) {
    const link = { url: `${origin}/consegna/${token}`, expiresAt };
    assert.deepEqual(normalizeOrderShareLink(link), { url: expected, expiresAt });
    assert.equal(link.url, `${origin}/consegna/${token}`);
  }
});

test('already public links and missing links remain unchanged', () => {
  assert.deepEqual(normalizeOrderShareLink({ url: expected, expiresAt }), { url: expected, expiresAt });
  assert.equal(normalizeOrderShareLink(null), null);
});

test('unrelated routes, malformed URLs and token-changing additions are rejected', () => {
  for (const url of [
    'not-a-url', `https://trevi-order-sync.lovable.app/auth/${token}`,
    `https://trevi-order-sync.lovable.app/consegna/${token}/extra`,
    `${expected}?token=other`, `${expected}#extra`,
    `https://user:password@trevi-order-sync.lovable.app/consegna/${token}`,
    `ftp://example.test/consegna/${token}`, 'https://example.test/consegna/short',
  ]) assert.equal(normalizeOrderShareLink({ url, expiresAt }), null);
});

test('new links reject invalid tokens rather than generating another route', () => {
  for (const invalid of ['', 'short', `${token}/other`, `${token}?x=1`, 'a'.repeat(201)]) {
    assert.throws(() => orderShareUrl(invalid));
  }
});

test('Email, WhatsApp and SMS carry the same public delivery link', () => {
  const normalized = normalizeOrderShareLink({ url: `http://localhost:8080/consegna/${token}`, expiresAt });
  assert.ok(normalized);
  for (const channel of ['email', 'whatsapp', 'sms'] as const) {
    const href = shareHref(channel, channel === 'email' ? 'supplier@example.test' : '+393331234567', 'ORD-DEMO', normalized.url);
    assert.ok(href);
    assert.ok(decodeURIComponent(href).includes(expected));
    assert.equal(href.includes('localhost'), false);
  }
});