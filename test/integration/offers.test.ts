import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handler as discovery } from '../../src/handlers/discovery.js';
import { handler } from '../../src/handlers/merchant.js';
import { expectContract } from '../support/contract.js';
import { apiEvent, bodyOf } from '../support/events.js';
import { createTestTable, merchantAt, putItems, testOffer } from './helpers.js';

const centre = { lat: -37.8136, lng: 144.9631 };
const merchantA = { sub: 'merchant-a' };
const merchantB = { sub: 'merchant-b' };
const flatWhite = { productName: 'Flat white', categoryId: 'coffee', percentOff: 20, originalPriceCents: 450 };

const create = (body: unknown, caller = merchantA) => handler(apiEvent('POST /merchant/offers', { ...caller, body }));
const patch = (offerId: string, body: unknown, caller = merchantA) =>
  handler(apiEvent('PATCH /merchant/offers/{offerId}', { ...caller, path: { offerId }, body }));
const remove = (offerId: string, caller = merchantA) =>
  handler(apiEvent('DELETE /merchant/offers/{offerId}', { ...caller, path: { offerId } }));
const list = (caller = merchantA) => handler(apiEvent('GET /merchant/offers', caller));
const discoveredOfferIds = async () =>
  bodyOf(await discovery(apiEvent('GET /discovery', { sub: 'consumer-1', query: { lat: String(centre.lat), lng: String(centre.lng) } })))
    .items.flatMap((m: { offers: { offerId: string }[] }) => m.offers.map((o) => o.offerId));

let drop: () => Promise<void>;
beforeAll(async () => {
  ({ drop } = await createTestTable());
  await putItems([merchantAt('merchant-a', centre, 1), merchantAt('merchant-b', centre, 2)], [testOffer('merchant-b', 'b-offer')]);
});
afterAll(async () => drop?.());

describe('POST /merchant/offers', () => {
  it('creates an active offer with no image', async () => {
    const response = await create(flatWhite);
    expect(response.statusCode).toBe(201);
    const body = bodyOf(response);
    expectContract('POST', '/merchant/offers', 201, body);
    expect(body).toMatchObject({ ...flatWhite, merchantId: 'merchant-a', active: true, imageUrl: null, discountedPriceCents: 360 });
    expect(body.offerId).toEqual(expect.any(String));
  });

  it.each([
    ['percent 0', { ...flatWhite, percentOff: 0 }],
    ['percent 100', { ...flatWhite, percentOff: 100 }],
    ['price 0', { ...flatWhite, originalPriceCents: 0 }],
    ['negative price', { ...flatWhite, originalPriceCents: -1 }],
    ['fractional price', { ...flatWhite, originalPriceCents: 4.5 }],
    ['price over 1,000,000', { ...flatWhite, originalPriceCents: 1_000_001 }],
    ['unknown category', { ...flatWhite, categoryId: 'weapons' }],
  ])('answers %s with 400 and creates nothing', async (_, body) => {
    const before = bodyOf(await list()).items.length;
    const response = await create(body);
    expect(response.statusCode).toBe(400);
    expectContract('POST', '/merchant/offers', 400, bodyOf(response));
    expect(bodyOf(await list()).items).toHaveLength(before);
  });

  it('answers 404 for a merchant account with no shop profile', async () => {
    expect((await create(flatWhite, { sub: 'no-shop' })).statusCode).toBe(404);
  });
});

describe('GET /merchant/offers', () => {
  it("lists all of the merchant's offers, active and inactive, and nobody else's", async () => {
    const own = [(await create(flatWhite)), (await create({ ...flatWhite, active: false }))].map((r) => bodyOf(r).offerId);
    const response = await list();
    expect(response.statusCode).toBe(200);
    expectContract('GET', '/merchant/offers', 200, bodyOf(response));
    const ids = bodyOf(response).items.map((o: { offerId: string }) => o.offerId);
    expect(ids).toEqual(expect.arrayContaining(own));
    expect(ids).not.toContain('b-offer');
  });
});

describe('PATCH /merchant/offers/{offerId}', () => {
  it('recomputes discountedPriceCents when the percent changes', async () => {
    const { offerId } = bodyOf(await create(flatWhite));
    const response = await patch(offerId, { percentOff: 15 });
    expect(response.statusCode).toBe(200);
    expectContract('PATCH', '/merchant/offers/{offerId}', 200, bodyOf(response));
    expect(bodyOf(response)).toMatchObject({ percentOff: 15, originalPriceCents: 450, discountedPriceCents: 383 });
  });

  it('removes a deactivated offer from discovery, and brings it back when reactivated', async () => {
    const { offerId } = bodyOf(await create(flatWhite));
    expect(await discoveredOfferIds()).toContain(offerId);
    expect(bodyOf(await patch(offerId, { active: false })).active).toBe(false);
    expect(await discoveredOfferIds()).not.toContain(offerId);
    await patch(offerId, { active: true });
    expect(await discoveredOfferIds()).toContain(offerId);
  });

  it('clears the description with null', async () => {
    const { offerId } = bodyOf(await create({ ...flatWhite, description: 'Any size' }));
    expect(bodyOf(await patch(offerId, { description: null })).description).toBeNull();
  });

  it("answers 404 for another merchant's offer and changes nothing", async () => {
    const response = await patch('b-offer', { percentOff: 50 });
    expect(response.statusCode).toBe(404);
    expectContract('PATCH', '/merchant/offers/{offerId}', 404, bodyOf(response));
    const own = bodyOf(await list(merchantB)).items.find((o: { offerId: string }) => o.offerId === 'b-offer');
    expect(own.percentOff).toBe(15);
  });

  it('answers 400 for an invalid change', async () => {
    const { offerId } = bodyOf(await create(flatWhite));
    expect((await patch(offerId, { percentOff: 100 })).statusCode).toBe(400);
    expect((await patch(offerId, {})).statusCode).toBe(400);
  });
});

describe('DELETE /merchant/offers/{offerId}', () => {
  it('deletes the offer with 204', async () => {
    const { offerId } = bodyOf(await create(flatWhite));
    const response = await remove(offerId);
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(bodyOf(await list()).items.map((o: { offerId: string }) => o.offerId)).not.toContain(offerId);
    expect(await discoveredOfferIds()).not.toContain(offerId);
  });

  it("answers 404 for another merchant's offer and for an unknown one", async () => {
    expect((await remove('b-offer')).statusCode).toBe(404);
    expect((await remove('nope')).statusCode).toBe(404);
    expect(bodyOf(await list(merchantB)).items.map((o: { offerId: string }) => o.offerId)).toContain('b-offer');
  });
});

it('answers 401 without a merchant caller', async () => {
  expect((await handler(apiEvent('GET /merchant/offers'))).statusCode).toBe(401);
});
