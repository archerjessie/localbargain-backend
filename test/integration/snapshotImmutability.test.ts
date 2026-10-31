import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { signQr } from '../../src/domain/qr.js';
import { handler as consumer } from '../../src/handlers/consumer.js';
import { handler as merchant } from '../../src/handlers/merchant.js';
import { apiEvent, bodyOf } from '../support/events.js';
import { createTestTable, merchantAt, putItems, testOffer } from './helpers.js';

// Stubbed boundaries only: SSM (the key) and Cognito (consumer lookup).
const key = Buffer.alloc(32, 4);
vi.mock('../../src/data/qrKey.js', () => ({ qrKey: async () => key }));
vi.mock('../../src/identity/identity.js', async (original) => ({
  ...(await original<typeof import('../../src/identity/identity.js')>()),
  identity: () => ({ getConsumer: async (sub: string) => ({ sub, displayName: 'Alex' }) }),
}));

const shop = { sub: 'shop-1' };
const recorded = { productName: 'Flat white', categoryId: 'coffee', percentOff: 20, originalPriceCents: 450, discountedPriceCents: 360 };

const shopHistory = async () => bodyOf(await merchant(apiEvent('GET /merchant/redemptions', shop))).items;
const myHistory = async () => bodyOf(await consumer(apiEvent('GET /me/redemptions', { sub: 'consumer-1' }))).items;

let drop: () => Promise<void>;
let redemptionId: string;
beforeAll(async () => {
  ({ drop } = await createTestTable());
  await putItems(
    [merchantAt('shop-1', { lat: -37.8136, lng: 144.9631 }, 0)],
    [testOffer('shop-1', 'o1', { productName: 'Flat white', categoryId: 'coffee', percentOff: 20, originalPriceCents: 450 })],
  );
  const scan = await merchant(apiEvent('POST /merchant/redemptions', { ...shop, body: { qrValue: signQr(key, 'consumer-1', 'o1') } }));
  expect(scan.statusCode).toBe(201);
  ({ redemptionId } = bodyOf(scan));
});
afterAll(async () => drop?.());

describe('redemption values are fixed at scan time', () => {
  it('keeps the earlier name, percent, and both prices after the offer is renamed and repriced', async () => {
    const patch = await merchant(
      apiEvent('PATCH /merchant/offers/{offerId}', {
        ...shop, path: { offerId: 'o1' }, body: { productName: 'Oat flat white', percentOff: 10, originalPriceCents: 600 },
      }),
    );
    expect(bodyOf(patch)).toMatchObject({ productName: 'Oat flat white', percentOff: 10, discountedPriceCents: 540 });

    for (const history of [await shopHistory(), await myHistory()]) {
      expect(history.find((r: { redemptionId: string }) => r.redemptionId === redemptionId)).toMatchObject(recorded);
    }
  });

  it('records the new values for a scan made after the change', async () => {
    await merchant(apiEvent('POST /merchant/redemptions', { ...shop, body: { qrValue: signQr(key, 'consumer-1', 'o1') } }));
    expect((await shopHistory())[0]).toMatchObject({ productName: 'Oat flat white', percentOff: 10, originalPriceCents: 600, discountedPriceCents: 540 });
  });

  it('keeps past redemptions unchanged after the offer is deleted', async () => {
    expect((await merchant(apiEvent('DELETE /merchant/offers/{offerId}', { ...shop, path: { offerId: 'o1' } }))).statusCode).toBe(204);
    const history = await shopHistory();
    expect(history).toHaveLength(2);
    expect(history.find((r: { redemptionId: string }) => r.redemptionId === redemptionId)).toMatchObject(recorded);
  });
});
