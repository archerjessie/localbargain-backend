import { describe, expect, it } from 'vitest';
import localities from '../../src/reference/localities.json' with { type: 'json' };

describe('localities.json', () => {
  it('has Richmond in both VIC and NSW', () => {
    const states = localities.filter((l) => l.suburb === 'Richmond').map((l) => l.state);
    expect(states).toEqual(expect.arrayContaining(['VIC', 'NSW']));
  });

  it('has postcode 3121 with Richmond VIC and its coordinates', () => {
    const richmond = localities.find((l) => l.postcode === '3121' && l.suburb === 'Richmond');
    expect(richmond).toMatchObject({ state: 'VIC' });
    expect(richmond!.lat).toBeCloseTo(-37.82, 1);
    expect(richmond!.lng).toBeCloseTo(145.0, 1);
  });

  it('has only valid rows with no duplicates', () => {
    const states = new Set(['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']);
    const keys = new Set<string>();
    for (const l of localities) {
      expect(states.has(l.state)).toBe(true);
      expect(l.postcode).toMatch(/^\d{4}$/);
      expect(l.lat).toBeLessThan(0);
      expect(l.lng).toBeGreaterThan(0);
      keys.add(`${l.suburb}|${l.state}|${l.postcode}`);
    }
    expect(keys.size).toBe(localities.length);
  });
});
