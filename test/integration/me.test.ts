import { afterEach, describe, expect, it, vi } from 'vitest';
import { handler } from '../../src/handlers/consumer.js';
import { expectContract } from '../support/contract.js';
import { apiEvent, bodyOf } from '../support/events.js';

describe('GET /me', () => {
  afterEach(() => vi.unstubAllEnvs());

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
    vi.stubEnv('LOCAL_AUTH', '1');
    vi.stubEnv('AWS_SAM_LOCAL', 'true');
    const event = { ...apiEvent('GET /me'), headers: { 'x-debug-sub': 'local-consumer-1' } };
    expect(bodyOf(await handler(event))).toEqual({ userId: 'local-consumer-1', email: 'consumer1@localbargain.test', displayName: 'Alex' });
  });

  it('answers 401 without a caller', async () => {
    expect((await handler(apiEvent('GET /me'))).statusCode).toBe(401);
  });
});
