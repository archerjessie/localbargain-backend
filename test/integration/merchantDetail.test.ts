import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handler } from '../../src/handlers/discovery.js';
import { expectContract } from '../support/contract.js';
import { apiEvent, bodyOf } from '../support/events.js';
import { createTestTable, merchantAt, putItems, testOffer } from './helpers.js';

const consumer = { sub: 'consumer-1' };
const get = (merchantId: string, caller: { sub?: string } = consumer) =>
  handler(apiEvent('GET /merchants/{merchantId}', { ...caller, path: { merchantId } }));

let drop: () => Promise<void>;
beforeAll(async () => {
  ({ drop } = await createTestTable());
  await putItems(
    [merchantAt('m1', { lat: -37.8136, lng: 144.9631 }, 0), merchantAt('m2', { lat: -33.8688, lng: 151.2093 }, 0)],
    [testOffer('m1', 'o1'), testOffer('m1', 'o2', { active: false }), testOffer('m1', 'o3', { percentOff: 20 }), testOffer('m2', 'other')],
  );
});
afterAll(async () => drop?.());

describe('GET /merchants/{merchantId}', () => {
  it('returns the shop details and its active offers only', async () => {
    const response = await get('m1');
    expect(response.statusCode).toBe(200);
    const body = bodyOf(response);
    expectContract('GET', '/merchants/{merchantId}', 200, body);
    expect(body).toMatchObject({ merchantId: 'm1', name: 'Shop m1', shopType: 'cafe' });
    expect(body.offers.map((o: { offerId: string }) => o.offerId).sort()).toEqual(['o1', 'o3']);
    expect(body.offers.find((o: { offerId: string }) => o.offerId === 'o3').discountedPriceCents).toBe(360);
  });

  it('answers an unknown merchant ID with 404 not_found', async () => {
    const response = await get('nobody');
    expect(response.statusCode).toBe(404);
    expectContract('GET', '/merchants/{merchantId}', 404, bodyOf(response));
    expect(bodyOf(response).code).toBe('not_found');
  });

  it('answers 401 without a consumer', async () => {
    expect((await get('m1', {})).statusCode).toBe(401);
  });
});
