import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handler } from '../../src/handlers/merchant.js';
import { expectContract } from '../support/contract.js';
import { apiEvent, bodyOf } from '../support/events.js';
import { createTestTable, merchantAt, putItems } from './helpers.js';

let drop: () => Promise<void>;
beforeAll(async () => {
  ({ drop } = await createTestTable());
  await putItems([merchantAt('merchant-1', { lat: -37.8136, lng: 144.9631 }, 0)], []);
});
afterAll(async () => drop?.());

describe('GET /merchant/me', () => {
  it("returns the signed-in merchant's seeded shop", async () => {
    const response = await handler(apiEvent('GET /merchant/me', { sub: 'merchant-1' }));
    expect(response.statusCode).toBe(200);
    const body = bodyOf(response);
    expectContract('GET', '/merchant/me', 200, body);
    expect(body).toEqual({
      merchantId: 'merchant-1', name: 'Shop merchant-1', shopType: 'cafe', street: '1 Main St', suburb: 'Melbourne',
      state: 'VIC', postcode: '3000', lat: -37.8136, lng: 144.9631,
    });
  });

  it('answers 404 for a merchant account with no shop profile', async () => {
    const response = await handler(apiEvent('GET /merchant/me', { sub: 'no-shop' }));
    expect(response.statusCode).toBe(404);
    expectContract('GET', '/merchant/me', 404, bodyOf(response));
  });

  it('answers 401 without a caller', async () => {
    expect((await handler(apiEvent('GET /merchant/me'))).statusCode).toBe(401);
  });
});
