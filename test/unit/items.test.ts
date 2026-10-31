import { describe, expect, it } from 'vitest';
import { merchantProfileItem, offerFromItem, offerItem, profileFromItem, redemptionFromItem, redemptionItem } from '../../src/data/items.js';
import type { MerchantProfile, Offer } from '../../src/domain/types.js';

const profile: MerchantProfile = {
  merchantId: 'm1', name: 'Bean There', shopType: 'cafe', street: '1 Swanston St', suburb: 'Melbourne', state: 'VIC',
  postcode: '3000', lat: -37.8136, lng: 144.9631, geohash: 'r1r0fsnzv', createdAt: '2026-01-01T00:00:00.000Z',
};
const offer: Offer = {
  offerId: 'o1', merchantId: 'm1', productName: 'Flat white', categoryId: 'coffee', percentOff: 20, originalPriceCents: 450,
  active: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('DynamoDB items (design D5)', () => {
  it('keys a merchant profile and lists it in the discovery index', () => {
    expect(merchantProfileItem(profile)).toEqual({
      ...profile, PK: 'MERCHANT#m1', SK: 'PROFILE', GSI2PK: 'DISCOVERY', GSI2SK: 'MERCHANT#m1#PROFILE',
    });
  });

  it('lists an active offer in the discovery index', () => {
    expect(offerItem(offer)).toEqual({
      ...offer, PK: 'MERCHANT#m1', SK: 'OFFER#o1', GSI2PK: 'DISCOVERY', GSI2SK: 'MERCHANT#m1#OFFER#o1',
    });
  });

  it('leaves an inactive offer out of the discovery index', () => {
    const item = offerItem({ ...offer, active: false });
    expect(item).not.toHaveProperty('GSI2PK');
    expect(item).not.toHaveProperty('GSI2SK');
    expect(item).toMatchObject({ PK: 'MERCHANT#m1', SK: 'OFFER#o1', active: false });
  });

  it('reads items back into domain values without the keys', () => {
    expect(profileFromItem(merchantProfileItem(profile))).toEqual(profile);
    expect(offerFromItem(offerItem(offer))).toEqual(offer);
  });
});

describe('redemption items (design D5)', () => {
  const redemption = {
    redemptionId: 'r1', redeemedAt: '2026-11-01T10:00:00.000Z', merchantId: 'm1', merchantName: 'Bean There',
    userId: 'consumer-1', displayName: 'Alex', offerId: 'o1', productName: 'Flat white', categoryId: 'coffee' as const,
    percentOff: 15, originalPriceCents: 450, discountedPriceCents: 383,
  };

  it('keys a redemption under the shop by time, and under the consumer in GSI1', () => {
    expect(redemptionItem(redemption)).toEqual({
      ...redemption,
      PK: 'MERCHANT#m1', SK: 'REDEMPTION#2026-11-01T10:00:00.000Z#r1',
      GSI1PK: 'USER#consumer-1', GSI1SK: '2026-11-01T10:00:00.000Z#r1',
    });
  });

  it('has no GSI1 keys once anonymised', () => {
    const { userId: _u, displayName: _d, ...anonymous } = redemption;
    void [_u, _d];
    expect(redemptionItem(anonymous)).not.toHaveProperty('GSI1PK');
    expect(redemptionFromItem(redemptionItem(redemption))).toEqual(redemption);
  });
});
