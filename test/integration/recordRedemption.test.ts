import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { dynamoClient, tableName } from '../../src/data/clients.js';
import { deleteOffer } from '../../src/data/offers.js';
import { signQr } from '../../src/domain/qr.js';
import { handler } from '../../src/handlers/merchant.js';
import { expectContract } from '../support/contract.js';
import { apiEvent, bodyOf } from '../support/events.js';
import { createTestTable, merchantAt, putItems, testOffer } from './helpers.js';

// Stubbed boundaries only: SSM (the key) and Cognito (consumer lookup).
const key = Buffer.alloc(32, 5);
vi.mock('../../src/data/qrKey.js', () => ({ qrKey: async () => key }));
const consumers: Record<string, { sub: string; displayName?: string }> = {
  'consumer-a': { sub: 'consumer-a', displayName: 'Alex' },
  'consumer-noname': { sub: 'consumer-noname' },
};
vi.mock('../../src/identity/identity.js', async (original) => ({
  ...(await original<typeof import('../../src/identity/identity.js')>()),
  identity: () => ({ getConsumer: async (sub: string) => consumers[sub] ?? null }),
}));

const shopA = { sub: 'shop-a' };
const scan = (qrValue: unknown, caller = shopA) => handler(apiEvent('POST /merchant/redemptions', { ...caller, body: { qrValue } }));
const qrFor = (sub: string, offerId: string) => signQr(key, sub, offerId);

async function storedRedemptions(merchantId = 'shop-a') {
  const { Items } = await dynamoClient().send(
    new QueryCommand({ TableName: tableName(), KeyConditionExpression: 'PK = :pk AND begins_with(SK, :r)', ExpressionAttributeValues: { ':pk': `MERCHANT#${merchantId}`, ':r': 'REDEMPTION#' } }),
  );
  return Items ?? [];
}

let drop: () => Promise<void>;
beforeAll(async () => {
  ({ drop } = await createTestTable());
  await putItems(
    [merchantAt('shop-a', { lat: -37.8136, lng: 144.9631 }, 0), merchantAt('shop-b', { lat: -37.8136, lng: 144.9631 }, 1)],
    [
      testOffer('shop-a', 'flat-white', { productName: 'Flat white', percentOff: 15, originalPriceCents: 450 }),
      testOffer('shop-a', 'croissant', { productName: 'Croissant', categoryId: 'bakery', percentOff: 20, originalPriceCents: 500 }),
      testOffer('shop-a', 'paused', { active: false }),
      testOffer('shop-a', 'gone'),
      testOffer('shop-b', 'b-offer'),
    ],
  );
});
afterAll(async () => drop?.());

describe('POST /merchant/redemptions', () => {
  it('records one redemption with the offer values, both prices, and the display name', async () => {
    const response = await scan(qrFor('consumer-a', 'flat-white'));
    expect(response.statusCode).toBe(201);
    const body = bodyOf(response);
    expectContract('POST', '/merchant/redemptions', 201, body);
    expect(body).toEqual({
      redemptionId: expect.any(String), redeemedAt: expect.any(String), merchantId: 'shop-a', offerId: 'flat-white',
      productName: 'Flat white', categoryId: 'coffee', percentOff: 15, originalPriceCents: 450, discountedPriceCents: 383,
      displayName: 'Alex',
    });
  });

  it('stores the snapshot with no payment fields, linked to the consumer through GSI1', async () => {
    const stored = (await storedRedemptions()).find((r) => r.offerId === 'flat-white')!;
    expect(Object.keys(stored).sort()).toEqual([
      'GSI1PK', 'GSI1SK', 'PK', 'SK', 'categoryId', 'discountedPriceCents', 'displayName', 'merchantId', 'merchantName',
      'offerId', 'originalPriceCents', 'percentOff', 'productName', 'redeemedAt', 'redemptionId', 'userId',
    ]);
    expect(stored).toMatchObject({ userId: 'consumer-a', merchantName: 'Shop shop-a', GSI1PK: 'USER#consumer-a' });
  });

  it('records two separate redemptions when two products are scanned in one visit', async () => {
    const before = (await storedRedemptions()).length;
    expect((await scan(qrFor('consumer-a', 'flat-white'))).statusCode).toBe(201);
    expect((await scan(qrFor('consumer-a', 'croissant'))).statusCode).toBe(201);
    const after = await storedRedemptions();
    expect(after).toHaveLength(before + 2);
    expect(after.find((r) => r.offerId === 'croissant')).toMatchObject({ percentOff: 20, discountedPriceCents: 400 });
  });

  it('records displayName null when the consumer has no display name', async () => {
    expect(bodyOf(await scan(qrFor('consumer-noname', 'flat-white'))).displayName).toBeNull();
  });

  const rejects = async (qrValue: unknown, status: number, code: string) => {
    const before = (await storedRedemptions()).length;
    const response = await scan(qrValue);
    expect(response.statusCode).toBe(status);
    expectContract('POST', '/merchant/redemptions', status, bodyOf(response));
    expect(bodyOf(response).code).toBe(code);
    expect(await storedRedemptions()).toHaveLength(before);
  };

  it.each([
    ['malformed', 'not-a-qr'],
    ['wrong prefix', `lb2${qrFor('consumer-a', 'flat-white').slice(3)}`],
    ['tampered consumer', qrFor('consumer-a', 'flat-white').replace('consumer-a', 'consumer-noname')],
    ['tampered offer', qrFor('consumer-a', 'flat-white').replace('flat-white', 'croissant')],
    ['signed with another key', signQr(Buffer.alloc(32, 6), 'consumer-a', 'flat-white')],
  ])('answers a %s QR value with 400 invalid_qr and records nothing', async (_, qrValue) => {
    await rejects(qrValue, 400, 'invalid_qr');
  });

  it('answers an empty qrValue with 400 validation_error', async () => {
    await rejects('', 400, 'validation_error');
  });

  it("answers another shop's offer with 422 and records nothing", async () => {
    await rejects(qrFor('consumer-a', 'b-offer'), 422, 'offer_unavailable');
    expect(await storedRedemptions('shop-b')).toHaveLength(0);
  });

  it('answers a deactivated or deleted offer with 422 and records nothing', async () => {
    await rejects(qrFor('consumer-a', 'paused'), 422, 'offer_unavailable');
    await deleteOffer('shop-a', 'gone');
    await rejects(qrFor('consumer-a', 'gone'), 422, 'offer_unavailable');
  });

  it('answers a consumer account that no longer exists with 404 and records nothing', async () => {
    await rejects(qrFor('consumer-deleted', 'flat-white'), 404, 'consumer_not_found');
  });

  it('answers 401 without a merchant caller', async () => {
    expect((await handler(apiEvent('POST /merchant/redemptions', { body: { qrValue: 'x' } }))).statusCode).toBe(401);
  });
});
