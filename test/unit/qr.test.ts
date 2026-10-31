import { describe, expect, it } from 'vitest';
import { signQr, verifyQr } from '../../src/domain/qr.js';

const key = Buffer.alloc(32, 7);
const otherKey = Buffer.alloc(32, 8);

describe('lb1 QR values', () => {
  it('has the lb1.<sub>.<offerId>.<sig> shape with a 32-byte base64url signature', () => {
    expect(signQr(key, 'local-consumer-1', 'offer1')).toMatch(/^lb1\.local-consumer-1\.offer1\.[A-Za-z0-9_-]{43}$/);
  });

  it('is stable for the same consumer and offer', () => {
    expect(signQr(key, 'local-consumer-1', 'offer1')).toBe(signQr(key, 'local-consumer-1', 'offer1'));
  });

  it('differs across consumers and across offers', () => {
    const values = new Set([
      signQr(key, 'local-consumer-1', 'offer1'),
      signQr(key, 'local-consumer-2', 'offer1'),
      signQr(key, 'local-consumer-1', 'offer2'),
    ]);
    expect(values.size).toBe(3);
  });

  it('verifies a signed value back to its consumer and offer', () => {
    expect(verifyQr(key, signQr(key, 'local-consumer-1', 'offer1'))).toEqual({ sub: 'local-consumer-1', offerId: 'offer1' });
  });

  it('rejects a tampered sub, offerId, or signature', () => {
    const [prefix, , , sig] = signQr(key, 'local-consumer-1', 'offer1').split('.');
    expect(verifyQr(key, `${prefix}.local-consumer-2.offer1.${sig}`)).toBeNull();
    expect(verifyQr(key, `${prefix}.local-consumer-1.offer2.${sig}`)).toBeNull();
    const flipped = (sig![0] === 'A' ? 'B' : 'A') + sig!.slice(1);
    expect(verifyQr(key, `${prefix}.local-consumer-1.offer1.${flipped}`)).toBeNull();
  });

  it('rejects a non-canonical encoding of the right signature', () => {
    const value = signQr(key, 'local-consumer-1', 'offer1');
    const last = value.at(-1)!;
    // The last of 43 base64url characters carries 2 unused bits, so these decode to the same bytes.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const twin = alphabet[alphabet.indexOf(last) ^ 1]!;
    expect(Buffer.from(value.slice(-43, -1) + twin, 'base64url')).toEqual(Buffer.from(value.slice(-43), 'base64url'));
    expect(verifyQr(key, value.slice(0, -1) + twin)).toBeNull();
  });

  it('rejects a value signed with another key', () => {
    expect(verifyQr(key, signQr(otherKey, 'local-consumer-1', 'offer1'))).toBeNull();
  });

  it.each(['', 'lb1', 'lb1.a.b', 'lb2.a.b.c', 'lb1..offer1.sig', 'lb1.a.b.c.d', 'not a qr'])('rejects malformed value %j', (value) => {
    expect(verifyQr(key, value)).toBeNull();
  });
});
