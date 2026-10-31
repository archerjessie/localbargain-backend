import { describe, expect, it } from 'vitest';
import { handler } from '../../src/handlers/discovery.js';
import { categories } from '../../src/reference/categories.js';
import { expectContract } from '../support/contract.js';
import { apiEvent, bodyOf } from '../support/events.js';

const consumer = { sub: 'consumer-1' };

describe('GET /categories', () => {
  it('lists every category without a caller', async () => {
    const response = await handler(apiEvent('GET /categories'));
    expect(response.statusCode).toBe(200);
    expect(bodyOf(response)).toEqual({ items: categories });
    expectContract('GET', '/categories', 200, bodyOf(response));
  });
});

describe('GET /locations', () => {
  it('finds the localities of postcode 3121, with coordinates', async () => {
    const response = await handler(apiEvent('GET /locations', { ...consumer, query: { q: '3121' } }));
    expect(response.statusCode).toBe(200);
    expectContract('GET', '/locations', 200, bodyOf(response));
    const items = bodyOf(response).items as { suburb: string; state: string; postcode: string; lat: number; lng: number }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((l) => l.postcode === '3121' && l.state === 'VIC')).toBe(true);
    expect(items).toContainEqual(expect.objectContaining({ suburb: 'Richmond', lat: expect.any(Number), lng: expect.any(Number) }));
  });

  it('returns one Richmond per state, each with its own postcode and coordinates', async () => {
    const items = bodyOf(await handler(apiEvent('GET /locations', { ...consumer, query: { q: 'Richmond' } }))).items as {
      suburb: string; state: string; postcode: string;
    }[];
    const richmonds = items.filter((l) => l.suburb === 'Richmond');
    expect(new Set(richmonds.map((l) => l.state))).toEqual(new Set(['NSW', 'QLD', 'SA', 'TAS', 'VIC']));
    expect(items.length).toBeLessThanOrEqual(20);
  });

  it.each([{}, { q: 'R' }])('answers %j with 400 validation_error', async (query) => {
    const response = await handler(apiEvent('GET /locations', { ...consumer, query }));
    expect(response.statusCode).toBe(400);
    expect(bodyOf(response).code).toBe('validation_error');
  });

  it('answers 401 without a consumer', async () => {
    expect((await handler(apiEvent('GET /locations', { query: { q: '3121' } }))).statusCode).toBe(401);
  });
});
