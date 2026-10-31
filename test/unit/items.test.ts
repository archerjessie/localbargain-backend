import { describe, expect, it } from 'vitest';
import { merchantProfileItem, offerFromItem, offerItem, profileFromItem } from '../../src/data/items.js';
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
