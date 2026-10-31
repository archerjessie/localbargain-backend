import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { verifyQr } from '../../src/domain/qr.js';
import { handler } from '../../src/handlers/consumer.js';
import { expectContract } from '../support/contract.js';
import { apiEvent, bodyOf } from '../support/events.js';
import { createTestTable, merchantAt, putItems, testOffer } from './helpers.js';

// The only stubbed boundary: SSM, which holds the deployed key.
const key = Buffer.alloc(32, 9);
vi.mock('../../src/data/qrKey.js', () => ({ qrKey: async () => key }));

const qr = (merchantId: string, offerId: string, sub = 'consumer-a') =>
  handler(apiEvent('GET /merchants/{merchantId}/offers/{offerId}/qr', { sub, path: { merchantId, offerId } }));
const qrValue = async (merchantId: string, offerId: string, sub?: string) => bodyOf(await qr(merchantId, offerId, sub)).qrValue;

let drop: () => Promise<void>;
beforeAll(async () => {
  ({ drop } = await createTestTable());
  await putItems(
    [merchantAt('m1', { lat: -37.8136, lng: 144.9631 }, 0)],
    [testOffer('m1', 'o1'), testOffer('m1', 'o2'), testOffer('m1', 'inactive', { active: false })],
  );
});
afterAll(async () => drop?.());

describe('GET /merchants/{merchantId}/offers/{offerId}/qr', () => {
  it('returns a signed lb1 value for the caller and the offer', async () => {
    const response = await qr('m1', 'o1');
    expect(response.statusCode).toBe(200);
    expectContract('GET', '/merchants/{merchantId}/offers/{offerId}/qr', 200, bodyOf(response));
    expect(verifyQr(key, bodyOf(response).qrValue)).toEqual({ sub: 'consumer-a', offerId: 'o1' });
  });

  it('gives the same value on repeated calls', async () => {
    expect(await qrValue('m1', 'o1')).toBe(await qrValue('m1', 'o1'));
  });

  it('differs between consumers and between offers', async () => {
    const values = new Set([await qrValue('m1', 'o1'), await qrValue('m1', 'o1', 'consumer-b'), await qrValue('m1', 'o2')]);
    expect(values.size).toBe(3);
  });

  it.each([
    ['an inactive offer', 'm1', 'inactive'],
    ['an unknown offer', 'm1', 'nope'],
    ['an offer under the wrong merchant', 'm2', 'o1'],
  ])('answers 404 for %s', async (_, merchantId, offerId) => {
    const response = await qr(merchantId, offerId);
    expect(response.statusCode).toBe(404);
    expectContract('GET', '/merchants/{merchantId}/offers/{offerId}/qr', 404, bodyOf(response));
  });

  it('answers 404 once the offer is deleted', async () => {
    await putItems([], [testOffer('m1', 'short-lived')]);
    expect((await qr('m1', 'short-lived')).statusCode).toBe(200);
    const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
    const { dynamoClient, tableName } = await import('../../src/data/clients.js');
    await dynamoClient().send(new DeleteCommand({ TableName: tableName(), Key: { PK: 'MERCHANT#m1', SK: 'OFFER#short-lived' } }));
    expect((await qr('m1', 'short-lived')).statusCode).toBe(404);
  });

  it('answers 401 without a consumer', async () => {
    expect((await handler(apiEvent('GET /merchants/{merchantId}/offers/{offerId}/qr', { path: { merchantId: 'm1', offerId: 'o1' } }))).statusCode).toBe(401);
  });
});
