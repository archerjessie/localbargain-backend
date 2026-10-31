import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handler } from '../../src/handlers/discovery.js';
import { expectContract } from '../support/contract.js';
import { apiEvent, bodyOf } from '../support/events.js';
import { createTestTable, merchantAt, putItems, testOffer } from './helpers.js';

const centre = { lat: -37.8136, lng: 144.9631 };
const consumer = { sub: 'consumer-1' };
const discover = (query: Record<string, string>) => handler(apiEvent('GET /discovery', { ...consumer, query }));

let drop: () => Promise<void>;
beforeAll(async () => {
  ({ drop } = await createTestTable());
  await putItems(
    [merchantAt('three-km', centre, 3), merchantAt('one-km', centre, 1), merchantAt('eight-km', centre, 8), merchantAt('inactive-only', centre, 0.5)],
    [
      testOffer('three-km', 'o3'),
      testOffer('one-km', 'o1', { imageKey: 'offers/one-km/o1/a.jpg', description: 'Any size' }),
      testOffer('one-km', 'o1-off', { active: false }),
      testOffer('eight-km', 'o8'),
      testOffer('inactive-only', 'oi', { active: false }),
    ],
  );
});
afterAll(async () => drop?.());

describe('GET /discovery', () => {
  it('returns the 1 km and 3 km merchants, nearest first, with distances and active offers only', async () => {
    const response = await discover({ lat: String(centre.lat), lng: String(centre.lng) });
    expect(response.statusCode).toBe(200);
    const body = bodyOf(response);
    expectContract('GET', '/discovery', 200, body);
    expect(body.items.map((m: { merchantId: string }) => m.merchantId)).toEqual(['one-km', 'three-km']);
    expect(body.items[0].distanceMetres).toBeCloseTo(1001, -1);
    expect(body.items[0].offers).toEqual([
      expect.objectContaining({
        offerId: 'o1', originalPriceCents: 450, discountedPriceCents: 383, description: 'Any size',
        imageUrl: `${process.env.IMAGE_BASE_URL}offers/one-km/o1/a.jpg`,
      }),
    ]);
  });

  it('leaves out a merchant with only inactive offers', async () => {
    const body = bodyOf(await discover({ lat: String(centre.lat), lng: String(centre.lng), radiusMetres: '50000' }));
    expect(body.items.map((m: { merchantId: string }) => m.merchantId)).not.toContain('inactive-only');
  });

  it('leaves out the 8 km merchant at the default radius, and finds it within 10 km', async () => {
    const ids = async (query: Record<string, string>) => bodyOf(await discover(query)).items.map((m: { merchantId: string }) => m.merchantId);
    expect(await ids({ lat: String(centre.lat), lng: String(centre.lng) })).not.toContain('eight-km');
    expect(await ids({ lat: String(centre.lat), lng: String(centre.lng), radiusMetres: '10000' })).toContain('eight-km');
  });

  it.each([{ lat: '91', lng: '144' }, { lat: '-37', lng: '144', radiusMetres: '50001' }])('answers %j with 400', async (query) => {
    const response = await discover(query);
    expect(response.statusCode).toBe(400);
    expectContract('GET', '/discovery', 400, bodyOf(response));
  });

  it('answers 401 without a consumer', async () => {
    expect((await handler(apiEvent('GET /discovery', { query: { lat: '-37', lng: '144' } }))).statusCode).toBe(401);
  });
});
