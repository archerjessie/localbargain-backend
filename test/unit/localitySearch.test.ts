import { describe, expect, it } from 'vitest';
import { searchLocalities } from '../../src/domain/localitySearch.js';

const at = (suburb: string, state: string, postcode: string) => ({ suburb, state, postcode, lat: -37, lng: 145 });
const list = [
  at('Burnley', 'VIC', '3121'),
  at('Cremorne', 'VIC', '3121'),
  at('Richmond', 'NSW', '2753'),
  at('Richmond', 'VIC', '3121'),
  at('Richmond East', 'VIC', '3121'),
  at('Richmond Lowlands', 'NSW', '2470'),
  at('Ringwood', 'VIC', '3134'),
];

describe('searchLocalities', () => {
  it('matches a 4-digit query to postcodes exactly', () => {
    expect(searchLocalities('3121', list)?.map((l) => l.suburb)).toEqual(['Burnley', 'Cremorne', 'Richmond', 'Richmond East']);
  });

  it('matches suburb names by case-insensitive prefix, exact names first', () => {
    expect(searchLocalities('  richMOND ', list)?.map((l) => `${l.suburb} ${l.state}`)).toEqual([
      'Richmond NSW', 'Richmond VIC', 'Richmond East VIC', 'Richmond Lowlands NSW',
    ]);
  });

  it('returns nothing for a prefix with no match', () => {
    expect(searchLocalities('Zz', list)).toEqual([]);
  });

  it('caps results at 20', () => {
    const many = Array.from({ length: 30 }, (_, i) => at(`Riverside ${i}`, 'VIC', '3000'));
    expect(searchLocalities('Riv', many)).toHaveLength(20);
  });

  it.each(['', 'R', ' R '])('rejects the too-short query %j', (q) => {
    expect(searchLocalities(q, list)).toBeNull();
  });
});
