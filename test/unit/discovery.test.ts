import { describe, expect, it } from 'vitest';
import { discover } from '../../src/domain/discovery.js';
import type { MerchantProfile, Offer } from '../../src/domain/types.js';

const centre = { lat: -37.8136, lng: 144.9631 };
// 0.009 degrees of latitude is about 1 km.
const merchantAtKm = (merchantId: string, km: number): MerchantProfile => ({
  merchantId, name: merchantId, shopType: 'cafe', street: '1 Main St', suburb: 'Melbourne', state: 'VIC',
  postcode: '3000', lat: centre.lat + 0.009 * km, lng: centre.lng, geohash: 'r1r0fsnzv', createdAt: '2026-01-01T00:00:00Z',
});
const offer = (merchantId: string, offerId: string, active = true): Offer => ({
  offerId, merchantId, productName: 'Flat white', categoryId: 'coffee', percentOff: 20, originalPriceCents: 450,
  active, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
});

describe('discover', () => {
  const profiles = [merchantAtKm('three', 3), merchantAtKm('eight', 8), merchantAtKm('one', 1), merchantAtKm('inactive', 0.5)];
  const offers = [
    offer('three', 'o3'), offer('eight', 'o8'), offer('one', 'o1'), offer('one', 'o1-off', false), offer('inactive', 'oi', false),
  ];

  it('returns merchants with active offers inside the radius, nearest first', () => {
    const result = discover(profiles, offers, centre, 5000);
    expect(result.map((r) => r.merchant.merchantId)).toEqual(['one', 'three']);
    expect(result[0]!.distanceMetres).toBeCloseTo(1001, -1);
    expect(Number.isInteger(result[0]!.distanceMetres)).toBe(true);
  });

  it('includes only active offers', () => {
    expect(discover(profiles, offers, centre, 5000)[0]!.offers.map((o) => o.offerId)).toEqual(['o1']);
  });

  it('leaves out a merchant whose offers are all inactive', () => {
    expect(discover(profiles, offers, centre, 50_000).map((r) => r.merchant.merchantId)).not.toContain('inactive');
  });

  it('leaves out an 8 km merchant at a 5 km radius but includes it at 10 km', () => {
    expect(discover(profiles, offers, centre, 5000).map((r) => r.merchant.merchantId)).not.toContain('eight');
    expect(discover(profiles, offers, centre, 10_000).map((r) => r.merchant.merchantId)).toContain('eight');
  });

  it('caps the result at the 100 nearest merchants', () => {
    const many = Array.from({ length: 150 }, (_, i) => merchantAtKm(`m${i}`, (150 - i) / 100));
    const result = discover(many, many.map((m) => offer(m.merchantId, `o-${m.merchantId}`)), centre, 5000);
    expect(result).toHaveLength(100);
    expect(result[0]!.merchant.merchantId).toBe('m149');
    expect(result[99]!.merchant.merchantId).toBe('m50');
  });

  it('excludes a merchant just outside the radius even when its distance rounds down to the radius', () => {
    const justOutside = { ...merchantAtKm('edge', 0), lat: centre.lat + 0.0449665 };
    const result = discover([justOutside], [offer('edge', 'oe')], centre, 5000);
    expect(result).toEqual([]);
  });
});
