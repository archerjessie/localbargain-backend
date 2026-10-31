import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { verifyQr } from '../../src/domain/qr.js';
import { handler } from '../../src/handlers/consumer.js';
import { apiEvent, bodyOf } from '../support/events.js';
import { createTestTable, merchantAt, putItems, testOffer } from './helpers.js';

// No mocks: the real key loader decodes QR_KEY from local/env.json, as sam local does.
const { Parameters: localEnv } = JSON.parse(readFileSync(new URL('../../local/env.json', import.meta.url), 'utf8'));

let drop: () => Promise<void>;
beforeAll(async () => {
  ({ drop } = await createTestTable());
  await putItems([merchantAt('m1', { lat: -37.8136, lng: 144.9631 }, 0)], [testOffer('m1', 'o1')]);
});
afterAll(async () => drop?.());
afterEach(() => vi.unstubAllEnvs());

describe('GET /merchants/{merchantId}/offers/{offerId}/qr in local mode', () => {
  it('signs with the local key from local/env.json', async () => {
    vi.stubEnv('LOCAL_AUTH', '1');
    vi.stubEnv('AWS_SAM_LOCAL', 'true');
    vi.stubEnv('QR_KEY', localEnv.QR_KEY);
    const event = { ...apiEvent('GET /merchants/{merchantId}/offers/{offerId}/qr', { path: { merchantId: 'm1', offerId: 'o1' } }), headers: { 'x-debug-sub': 'local-consumer-1' } };
    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    expect(verifyQr(Buffer.from(localEnv.QR_KEY, 'base64'), bodyOf(response).qrValue)).toEqual({ sub: 'local-consumer-1', offerId: 'o1' });
  });
});
