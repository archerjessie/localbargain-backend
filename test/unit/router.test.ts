import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { json } from '../../src/domain/responses.js';
import { router } from '../../src/handlers/router.js';

const event = (routeKey: string) => ({ routeKey }) as APIGatewayProxyEventV2WithJWTAuthorizer;

describe('router', () => {
  it('dispatches on routeKey', async () => {
    const handler = router({ 'GET /categories': async () => json(200, { items: [] }) });
    expect(await handler(event('GET /categories'))).toMatchObject({ statusCode: 200 });
  });

  it('answers an unknown route with 404 not_found', async () => {
    const response = await router({})(event('GET /nope'));
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toMatchObject({ code: 'not_found' });
  });

  it.each(['constructor', 'toString', '__proto__'])('does not treat inherited key %s as a route', async (routeKey) => {
    expect((await router({})(event(routeKey))).statusCode).toBe(404);
  });

  it('turns a thrown error into 500 internal_error without leaking the message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await router({ 'GET /boom': async () => { throw new Error('secret detail'); } })(event('GET /boom'));
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ code: 'internal_error', message: 'Internal server error' });
  });
});
