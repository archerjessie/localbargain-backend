import { describe, expect, it } from 'vitest';
import { handler } from '../../src/handlers/consumer.js';
import { expectContract } from '../support/contract.js';
import { apiEvent, bodyOf } from '../support/events.js';

describe('GET /me', () => {
  it('returns userId, email, and displayName from the ID token claims', async () => {
    const response = await handler(apiEvent('GET /me', { sub: 'consumer-1', email: 'alex@example.com', givenName: 'Alex' }));
    expect(response.statusCode).toBe(200);
    expectContract('GET', '/me', 200, bodyOf(response));
    expect(bodyOf(response)).toEqual({ userId: 'consumer-1', email: 'alex@example.com', displayName: 'Alex' });
  });

  it('returns displayName null when the account has no given name', async () => {
    const body = bodyOf(await handler(apiEvent('GET /me', { sub: 'consumer-2', email: 'sam@example.com' })));
    expectContract('GET', '/me', 200, body);
    expect(body.displayName).toBeNull();
  });

  it('returns the fixture user in local mode', async () => {
    Object.assign(process.env, { LOCAL_AUTH: '1', AWS_SAM_LOCAL: 'true' });
    try {
      const event = { ...apiEvent('GET /me'), headers: { 'x-debug-sub': 'local-consumer-1' } };
      expect(bodyOf(await handler(event))).toEqual({ userId: 'local-consumer-1', email: 'consumer1@localbargain.test', displayName: 'Alex' });
    } finally {
      delete process.env.LOCAL_AUTH;
      delete process.env.AWS_SAM_LOCAL;
    }
  });

  it('answers 401 without a caller', async () => {
    expect((await handler(apiEvent('GET /me'))).statusCode).toBe(401);
  });
});
