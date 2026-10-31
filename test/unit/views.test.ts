import { describe, expect, it } from 'vitest';
import type { MerchantProfile, Offer } from '../../src/domain/types.js';
import { merchantView, offerView } from '../../src/domain/views.js';

const profile: MerchantProfile = {
  merchantId: 'm1', name: 'Bean There', shopType: 'cafe', street: '1 Swanston St', suburb: 'Melbourne', state: 'VIC',
  postcode: '3000', lat: -37.8136, lng: 144.9631, geohash: 'r1r0fsnzv', createdAt: '2026-01-01T00:00:00.000Z',
};
const offer: Offer = {
  offerId: 'o1', merchantId: 'm1', productName: 'Flat white', categoryId: 'coffee', percentOff: 15, originalPriceCents: 450,
  active: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('merchantView', () => {
  it('shows the public shop fields, without geohash or createdAt', () => {
    expect(merchantView(profile)).toEqual({
      merchantId: 'm1', name: 'Bean There', shopType: 'cafe', street: '1 Swanston St', suburb: 'Melbourne', state: 'VIC',
      postcode: '3000', lat: -37.8136, lng: 144.9631,
    });
  });
});

describe('offerView', () => {
  it('adds the discounted price and null description and imageUrl when absent', () => {
    expect(offerView(offer, 'https://cdn.example/')).toEqual({
      offerId: 'o1', merchantId: 'm1', productName: 'Flat white', categoryId: 'coffee', percentOff: 15,
      originalPriceCents: 450, discountedPriceCents: 383, description: null, imageUrl: null, active: true,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('builds imageUrl from IMAGE_BASE_URL and the stored key', () => {
    const view = offerView({ ...offer, description: 'Any size', imageKey: 'offers/m1/o1/a.jpg' }, 'https://cdn.example/');
    expect(view).toMatchObject({ description: 'Any size', imageUrl: 'https://cdn.example/offers/m1/o1/a.jpg' });
    expect(view).not.toHaveProperty('imageKey');
  });
});
