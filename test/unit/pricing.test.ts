import { describe, expect, it } from 'vitest';
import { discountedPriceCents } from '../../src/domain/pricing.js';

describe('discountedPriceCents', () => {
  it('rounds half up: 450 cents at 15% is 383', () => {
    expect(discountedPriceCents(450, 15)).toBe(383);
  });

  it('follows a percent change: 450 cents at 20% is 360', () => {
    expect(discountedPriceCents(450, 20)).toBe(360);
  });

  it('rounds below half down: 333 cents at 10% is 300', () => {
    expect(discountedPriceCents(333, 10)).toBe(300);
  });

  it('stays exact at the largest price and percent', () => {
    expect(discountedPriceCents(1_000_000, 99)).toBe(10_000);
    expect(discountedPriceCents(1, 99)).toBe(0);
  });
});
