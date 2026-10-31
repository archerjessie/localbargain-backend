import { describe, expect, it } from 'vitest';
import { distanceMetres, geohash } from '../../src/domain/geo.js';

const melbourneGpo = { lat: -37.8136, lng: 144.9631 };
const sydneyGpo = { lat: -33.8688, lng: 151.2093 };

describe('distanceMetres', () => {
  it('is zero for the same point', () => {
    expect(distanceMetres(melbourneGpo, melbourneGpo)).toBe(0);
  });

  it('gives about 714 km from Melbourne to Sydney', () => {
    // Great-circle distance from published references: about 713.4 km.
    expect(distanceMetres(melbourneGpo, sydneyGpo)).toBeGreaterThan(712_000);
    expect(distanceMetres(melbourneGpo, sydneyGpo)).toBeLessThan(715_000);
  });

  it('gives about 1 km for 0.009 degrees of latitude', () => {
    const north = { lat: melbourneGpo.lat + 0.009, lng: melbourneGpo.lng };
    expect(distanceMetres(melbourneGpo, north)).toBeCloseTo(1001, -1);
  });
});

describe('geohash', () => {
  it('encodes -37.8136/144.9631 to r1r0fsnzv', () => {
    expect(geohash(-37.8136, 144.9631)).toBe('r1r0fsnzv');
  });

  it('encodes the textbook example 57.64911/10.40744 to u4pruydqq', () => {
    expect(geohash(57.64911, 10.40744)).toBe('u4pruydqq');
  });
});
