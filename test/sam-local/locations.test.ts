import { describe, expect, it } from 'vitest';
import { call } from './api.js';

describe('GET /categories (sam local)', () => {
  it('needs no caller', async () => {
    const { status, body } = await call('GET', '/categories');
    expect(status).toBe(200);
    expect(body.items).toContainEqual({ categoryId: 'coffee', name: 'Coffee' });
  });
});

describe('GET /locations (sam local)', () => {
  it('finds Richmond VIC by postcode 3121', async () => {
    const { status, body } = await call('GET', '/locations?q=3121', { as: 'local-consumer-1' });
    expect(status).toBe(200);
    expect(body.items).toContainEqual(expect.objectContaining({ suburb: 'Richmond', state: 'VIC', postcode: '3121' }));
  });

  it('returns one Richmond per state for the ambiguous name', async () => {
    const { body } = await call('GET', '/locations?q=Richmond', { as: 'local-consumer-1' });
    const states = body.items.filter((l: { suburb: string }) => l.suburb === 'Richmond').map((l: { state: string }) => l.state);
    expect(new Set(states)).toEqual(new Set(['NSW', 'QLD', 'SA', 'TAS', 'VIC']));
  });

  it('answers a too-short query with 400', async () => {
    const { status, body } = await call('GET', '/locations?q=R', { as: 'local-consumer-1' });
    expect(status).toBe(400);
    expect(body.code).toBe('validation_error');
  });

  it.each([undefined, 'local-merchant-1', 'local-consumer-99'])('answers caller %s with 401', async (as) => {
    expect((await call('GET', '/locations?q=3121', as ? { as } : {})).status).toBe(401);
  });
});
