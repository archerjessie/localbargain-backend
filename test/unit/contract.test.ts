import { describe, expect, it } from 'vitest';
import { expectContract } from '../support/contract.js';

describe('expectContract', () => {
  it('accepts a body that matches the contract', () => {
    expectContract('GET', '/categories', 200, { items: [{ categoryId: 'coffee', name: 'Coffee' }] });
  });

  it('rejects an unknown category, a missing field, and an extra field', () => {
    expect(() => expectContract('GET', '/categories', 200, { items: [{ categoryId: 'weapons', name: 'x' }] })).toThrow();
    expect(() => expectContract('GET', '/categories', 200, {})).toThrow();
    expect(() => expectContract('GET', '/categories', 200, { items: [{ categoryId: 'coffee', name: 'Coffee', extra: 1 }] })).toThrow();
  });

  it('follows response $refs such as BadRequest', () => {
    expectContract('GET', '/locations', 400, { code: 'validation_error', message: 'q: too short' });
    expect(() => expectContract('GET', '/locations', 400, { code: 'nope', message: 'x' })).toThrow();
  });
});
