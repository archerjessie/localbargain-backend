import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { getCaller } from '../../src/identity/caller.js';

const LOCAL = { LOCAL_AUTH: '1', AWS_SAM_LOCAL: 'true' };

function event(opts: { header?: string; claims?: Record<string, string> }) {
  return {
    headers: opts.header ? { 'x-debug-sub': opts.header } : {},
    requestContext: opts.claims ? { authorizer: { jwt: { claims: opts.claims, scopes: null } } } : {},
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

function expect401(result: ReturnType<typeof getCaller>) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.response.statusCode).toBe(401);
  expect(JSON.parse(result.response.body)).toEqual({ message: 'Unauthorized' });
}

const idClaims = { sub: 'abc-123', email: 'a@example.com', given_name: 'Alex', token_use: 'id' };

describe('getCaller in local mode', () => {
  it('identifies the caller from x-debug-sub and the fixture', () => {
    expect(getCaller(event({ header: 'local-consumer-1' }), 'consumer', LOCAL)).toEqual({
      ok: true,
      caller: { sub: 'local-consumer-1', email: 'consumer1@localbargain.test', displayName: 'Alex' },
    });
  });

  it('finds the header whatever its case, as sam local title-cases header names', () => {
    const e = { headers: { 'X-Debug-Sub': 'local-consumer-2' }, requestContext: {} } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
    expect(getCaller(e, 'consumer', LOCAL)).toMatchObject({ ok: true, caller: { sub: 'local-consumer-2' } });
  });

  it('answers 401 for a missing or unknown sub', () => {
    expect401(getCaller(event({}), 'consumer', LOCAL));
    expect401(getCaller(event({ header: 'local-consumer-99' }), 'consumer', LOCAL));
  });

  it('answers 401 for a sub from the wrong pool', () => {
    expect401(getCaller(event({ header: 'local-merchant-1' }), 'consumer', LOCAL));
    expect401(getCaller(event({ header: 'local-consumer-1' }), 'merchant', LOCAL));
  });
});

describe('getCaller when deployed', () => {
  it('ignores x-debug-sub when AWS_SAM_LOCAL is unset, even with LOCAL_AUTH=1', () => {
    expect401(getCaller(event({ header: 'local-consumer-1' }), 'consumer', { LOCAL_AUTH: '1' }));
  });

  it('ignores x-debug-sub when LOCAL_AUTH is unset', () => {
    expect401(getCaller(event({ header: 'local-consumer-1' }), 'consumer', { AWS_SAM_LOCAL: 'true' }));
  });

  it('uses the verified ID token claims, not the header', () => {
    expect(getCaller(event({ header: 'local-consumer-1', claims: idClaims }), 'consumer', { LOCAL_AUTH: '1' })).toEqual({
      ok: true,
      caller: { sub: 'abc-123', email: 'a@example.com', displayName: 'Alex' },
    });
  });

  it('leaves displayName out when the token has no given_name', () => {
    const { given_name: _unused, ...claims } = idClaims;
    void _unused;
    expect(getCaller(event({ claims }), 'consumer', {})).toEqual({
      ok: true, caller: { sub: 'abc-123', email: 'a@example.com' },
    });
  });

  it('answers 401 for an access token, which has no email claim', () => {
    expect401(getCaller(event({ claims: { sub: 'abc-123', token_use: 'access' } }), 'consumer', {}));
  });
});
