import { createHmac, timingSafeEqual } from 'node:crypto';

// Design D10: lb1.<sub>.<offerId>.<sig>, sig = base64url(HMAC-SHA256(key, "lb1|<sub>|<offerId>")).
const PREFIX = 'lb1';

function signature(key: Buffer, sub: string, offerId: string): Buffer {
  return createHmac('sha256', key).update(`${PREFIX}|${sub}|${offerId}`).digest();
}

export function signQr(key: Buffer, sub: string, offerId: string): string {
  return `${PREFIX}.${sub}.${offerId}.${signature(key, sub, offerId).toString('base64url')}`;
}

export function verifyQr(key: Buffer, value: string): { sub: string; offerId: string } | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const [prefix, sub, offerId, sig] = parts as [string, string, string, string];
  if (prefix !== PREFIX || !sub || !offerId || !sig) return null;
  const given = Buffer.from(sig, 'base64url');
  // Node decodes base64url leniently, so require the one canonical spelling of the signature.
  if (given.toString('base64url') !== sig) return null;
  const expected = signature(key, sub, offerId);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { sub, offerId };
}
