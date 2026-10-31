import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  UsernameExistsException,
  type CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import type { APIGatewayProxyEventV2WithIAMAuthorizer } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import type { MerchantProfile } from '../../src/domain/types.js';
import { createMerchantRoute } from '../../src/handlers/admin.js';
import { router } from '../../src/handlers/router.js';
import { cognitoIdentity } from '../../src/identity/identity.js';
import { expectContract } from '../support/contract.js';
import { apiEvent, bodyOf } from '../support/events.js';

// The admin route sits behind the IAM authorizer, so its event carries no JWT claims.
const adminEvent = (b: unknown) => apiEvent('POST /admin/merchants', { body: b }) as unknown as APIGatewayProxyEventV2WithIAMAuthorizer;

const body = {
  name: 'Bean There', shopType: 'cafe', street: '211 Swanston St', suburb: 'Melbourne', state: 'VIC',
  postcode: '3000', lat: -37.8136, lng: 144.9631, email: 'Owner@Example.com',
};

function setup(opts: { cognito?: (command: unknown) => unknown; save?: (p: MerchantProfile) => Promise<void> } = {}) {
  const send = vi.fn(async (command: unknown) =>
    opts.cognito ? opts.cognito(command) : { User: { Username: 'new-sub', Attributes: [{ Name: 'sub', Value: 'new-sub' }] } },
  );
  const client = { send } as unknown as CognitoIdentityProviderClient;
  const saveProfile = vi.fn(opts.save ?? (async () => {}));
  const route = createMerchantRoute({
    identity: cognitoIdentity(client, { consumerPoolId: 'c', merchantPoolId: 'merchant-pool' }),
    saveProfile,
    now: () => '2026-11-01T00:00:00.000Z',
  });
  // Through the router, which turns a thrown error into the 500 response.
  const handler = router({ 'POST /admin/merchants': route });
  return { route, send, saveProfile, call: () => handler(adminEvent(body)) };
}

describe('POST /admin/merchants', () => {
  it('creates the Cognito account, then the profile with merchantId = sub and the geohash', async () => {
    const { call, send, saveProfile } = setup();
    const response = await call();
    expect(response.statusCode).toBe(201);
    expectContract('POST', '/admin/merchants', 201, bodyOf(response));
    expect(bodyOf(response)).toEqual({ merchantId: 'new-sub' });
    expect((send.mock.calls[0]![0] as AdminCreateUserCommand).input.Username).toBe('owner@example.com');
    expect(saveProfile).toHaveBeenCalledWith({
      merchantId: 'new-sub', name: 'Bean There', shopType: 'cafe', street: '211 Swanston St', suburb: 'Melbourne',
      state: 'VIC', postcode: '3000', lat: -37.8136, lng: 144.9631, geohash: 'r1r0fsnzv', createdAt: '2026-11-01T00:00:00.000Z',
    });
  });

  it('answers a duplicate login email with 409 and creates nothing', async () => {
    const { call, saveProfile } = setup({
      cognito: () => {
        throw new UsernameExistsException({ message: 'exists', $metadata: {} });
      },
    });
    const response = await call();
    expect(response.statusCode).toBe(409);
    expectContract('POST', '/admin/merchants', 409, bodyOf(response));
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it('deletes the new account and answers 500 when the profile write fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { call, send } = setup({
      save: async () => {
        throw new Error('DynamoDB unavailable');
      },
    });
    const response = await call();
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response).code).toBe('internal_error');
    const rollback = send.mock.calls[1]![0] as AdminDeleteUserCommand;
    expect(rollback).toBeInstanceOf(AdminDeleteUserCommand);
    expect(rollback.input).toEqual({ UserPoolId: 'merchant-pool', Username: 'new-sub' });
  });

  it.each([{ lat: 51.5 }, { lng: -0.12 }, { postcode: '300' }])('answers %j with 400 and creates nothing', async (patch) => {
    const { route, send, saveProfile } = setup();
    const response = await route(adminEvent({ ...body, ...patch }));
    expect(response.statusCode).toBe(400);
    expectContract('POST', '/admin/merchants', 400, bodyOf(response));
    expect(send).not.toHaveBeenCalled();
    expect(saveProfile).not.toHaveBeenCalled();
  });
});
