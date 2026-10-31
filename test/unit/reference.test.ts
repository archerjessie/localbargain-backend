import { describe, expect, it } from 'vitest';
import { categories } from '../../src/reference/categories.js';
import { shopTypes } from '../../src/reference/shopTypes.js';

describe('reference lists', () => {
  it('has the categories from design D6 with unique IDs', () => {
    const ids = categories.map((c) => c.categoryId);
    expect(ids).toEqual([
      'coffee', 'bakery', 'meals', 'desserts', 'drinks', 'groceries',
      'beauty', 'health', 'fashion', 'retail', 'services', 'other',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of categories) expect(c.name).not.toBe('');
  });

  it('has the shop types from design D6 with unique IDs', () => {
    expect(shopTypes).toEqual([
      'cafe', 'restaurant', 'bakery', 'bar', 'retail', 'beauty', 'services', 'other',
    ]);
    expect(new Set(shopTypes).size).toBe(shopTypes.length);
  });
});
