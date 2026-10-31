import { describe, expect, it } from 'vitest';
import { snapshotRedemption } from '../../src/domain/snapshot.js';
import type { MerchantProfile, Offer } from '../../src/domain/types.js';

const merchant: MerchantProfile = {
  merchantId: 'local-merchant-1', name: 'Bean There', shopType: 'cafe', street: '1 Swanston St', suburb: 'Melbourne',
  state: 'VIC', postcode: '3000', lat: -37.8136, lng: 144.9631, geohash: 'r1r0fsnzv', createdAt: '2026-01-01T00:00:00Z',
};
const offer: Offer = {
  offerId: 'o1', merchantId: 'local-merchant-1', productName: 'Flat white', categoryId: 'coffee', percentOff: 15,
  originalPriceCents: 450, description: 'Any size', imageKey: 'offers/local-merchant-1/o1/a.jpg', active: true,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

describe('snapshotRedemption', () => {
  it('copies the offer, both prices, and both names at scan time', () => {
    expect(
      snapshotRedemption({
        redemptionId: 'r1', redeemedAt: '2026-11-01T10:00:00.000Z', merchant, offer,
        consumer: { userId: 'local-consumer-1', displayName: 'Alex' },
      }),
    ).toEqual({
      redemptionId: 'r1', redeemedAt: '2026-11-01T10:00:00.000Z', merchantId: 'local-merchant-1', merchantName: 'Bean There',
      userId: 'local-consumer-1', displayName: 'Alex', offerId: 'o1', productName: 'Flat white', categoryId: 'coffee',
      percentOff: 15, originalPriceCents: 450, discountedPriceCents: 383,
    });
  });

  it('leaves out displayName when the consumer has none', () => {
    const r = snapshotRedemption({ redemptionId: 'r1', redeemedAt: 't', merchant, offer, consumer: { userId: 'u' } });
    expect(r).not.toHaveProperty('displayName');
  });

  it('stays unchanged when the offer changes later', () => {
    const live = { ...offer };
    const r = snapshotRedemption({ redemptionId: 'r1', redeemedAt: 't', merchant, offer: live, consumer: { userId: 'u' } });
    Object.assign(live, { productName: 'Latte', percentOff: 50, originalPriceCents: 600 });
    expect(r).toMatchObject({ productName: 'Flat white', percentOff: 15, originalPriceCents: 450, discountedPriceCents: 383 });
  });

  it('refuses an offer that belongs to another merchant', () => {
    expect(() => snapshotRedemption({
      redemptionId: 'r1', redeemedAt: 't', merchant, offer: { ...offer, merchantId: 'local-merchant-2' }, consumer: { userId: 'u' },
    })).toThrow();
  });
});
