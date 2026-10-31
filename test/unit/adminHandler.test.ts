import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
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

function setup(
  opts: { cognito?: (command: unknown) => unknown; save?: (p: MerchantProfile) => Promise<void>; profileExists?: boolean } = {},
) {
  const send = vi.fn(async (command: unknown) =>
    opts.cognito ? opts.cognito(command) : { User: { Username: 'new-sub', Attributes: [{ Name: 'sub', Value: 'new-sub' }] } },
  );
  const client = { send } as unknown as CognitoIdentityProviderClient;
  const saveProfile = vi.fn(opts.save ?? (async () => {}));
  const profileExists = vi.fn(async () => opts.profileExists ?? false);
  const route = createMerchantRoute({
    identity: cognitoIdentity(client, { consumerPoolId: 'c', merchantPoolId: 'merchant-pool' }),
    saveProfile,
    profileExists,
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

  const existingAccount = (command: unknown) => {
    if (command instanceof AdminCreateUserCommand) throw new UsernameExistsException({ message: 'exists', $metadata: {} });
    if (command instanceof AdminGetUserCommand) return { Username: 'old-sub', UserAttributes: [{ Name: 'sub', Value: 'old-sub' }] };
    throw new Error('unexpected command');
  };

  it('answers a duplicate login email with 409 and creates nothing when that shop exists', async () => {
    const { call, send, saveProfile } = setup({ cognito: existingAccount, profileExists: true });
    const response = await call();
    expect(response.statusCode).toBe(409);
    expectContract('POST', '/admin/merchants', 409, bodyOf(response));
    expect(saveProfile).not.toHaveBeenCalled();
    expect(send.mock.calls.map(([c]) => c?.constructor.name)).toEqual(['AdminCreateUserCommand', 'AdminGetUserCommand']);
  });

  it('repairs an account left without a shop by an earlier failed create, so a retry succeeds', async () => {
    const { call, saveProfile } = setup({ cognito: existingAccount, profileExists: false });
    const response = await call();
    expect(response.statusCode).toBe(201);
    expect(bodyOf(response)).toEqual({ merchantId: 'old-sub' });
    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ merchantId: 'old-sub', name: 'Bean There' }));
  });

  it('logs both errors and rethrows the write error when the rollback also fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { call } = setup({
      cognito: (command) => {
        if (command instanceof AdminDeleteUserCommand) throw new Error('Cognito throttled');
        return { User: { Username: 'new-sub', Attributes: [{ Name: 'sub', Value: 'new-sub' }] } };
      },
      save: async () => {
        throw new Error('DynamoDB unavailable');
      },
    });
    expect((await call()).statusCode).toBe(500);
    const logged = log.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('Cognito throttled');
    expect(logged).toContain('DynamoDB unavailable');
    expect(logged).toContain('new-sub');
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
