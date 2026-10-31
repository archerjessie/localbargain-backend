import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  ListUsersCommand,
  UsernameExistsException,
  UserNotFoundException,
  type CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { describe, expect, it, vi } from 'vitest';
import { cognitoIdentity, fixtureIdentity, MerchantEmailTakenError } from '../../src/identity/identity.js';

function fakeClient(handler: (command: unknown) => unknown) {
  const send = vi.fn(async (command: unknown) => handler(command));
  return { client: { send } as unknown as CognitoIdentityProviderClient, send };
}

const pools = { consumerPoolId: 'consumer-pool', merchantPoolId: 'merchant-pool' };
const googleUser = {
  Username: 'Google_1234',
  Attributes: [{ Name: 'sub', Value: 'sub-1' }, { Name: 'given_name', Value: 'Alex' }, { Name: 'email', Value: 'a@example.com' }],
};

describe('cognitoIdentity', () => {
  const notFound = () => {
    throw new UserNotFoundException({ message: 'gone', $metadata: {} });
  };

  it('finds a native consumer with AdminGetUser, whose username is the sub', async () => {
    const { client, send } = fakeClient(() => ({ Username: 'sub-1', Enabled: true, UserAttributes: [{ Name: 'given_name', Value: 'Alex' }] }));
    expect(await cognitoIdentity(client, pools).getConsumer('sub-1')).toEqual({ sub: 'sub-1', displayName: 'Alex' });
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0]![0] as AdminGetUserCommand).input).toEqual({ UserPoolId: 'consumer-pool', Username: 'sub-1' });
  });

  it('falls back to ListUsers by sub for a federated consumer, reading only given_name', async () => {
    const { client, send } = fakeClient((command) => (command instanceof AdminGetUserCommand ? notFound() : { Users: [{ ...googleUser, Enabled: true }] }));
    expect(await cognitoIdentity(client, pools).getConsumer('sub-1')).toEqual({ sub: 'sub-1', displayName: 'Alex' });
    const command = send.mock.calls[1]![0] as ListUsersCommand;
    expect(command).toBeInstanceOf(ListUsersCommand);
    expect(command.input).toEqual({ UserPoolId: 'consumer-pool', Filter: 'sub = "sub-1"', Limit: 1, AttributesToGet: ['given_name'] });
  });

  it('treats a disabled consumer as gone', async () => {
    const { client } = fakeClient(() => ({ Username: 'sub-1', Enabled: false, UserAttributes: [] }));
    expect(await cognitoIdentity(client, pools).getConsumer('sub-1')).toBeNull();
  });

  it('returns null for a consumer that no longer exists', async () => {
    const { client } = fakeClient((command) => (command instanceof AdminGetUserCommand ? notFound() : { Users: [] }));
    expect(await cognitoIdentity(client, pools).getConsumer('gone')).toBeNull();
  });

  it('refuses a sub that could break out of the ListUsers filter', async () => {
    const { client, send } = fakeClient(() => ({ Users: [] }));
    expect(await cognitoIdentity(client, pools).getConsumer('x" or sub ^= "')).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('deletes a consumer by its username, and treats an already-deleted consumer as done', async () => {
    const { client, send } = fakeClient((command) =>
      command instanceof AdminGetUserCommand ? notFound() : command instanceof ListUsersCommand ? { Users: [{ ...googleUser, Enabled: true }] } : {},
    );
    await cognitoIdentity(client, pools).deleteConsumer('sub-1');
    const del = send.mock.calls[2]![0] as AdminDeleteUserCommand;
    expect(del).toBeInstanceOf(AdminDeleteUserCommand);
    expect(del.input).toEqual({ UserPoolId: 'consumer-pool', Username: 'Google_1234' });

    const gone = fakeClient((command) => (command instanceof AdminGetUserCommand ? notFound() : { Users: [] }));
    await expect(cognitoIdentity(gone.client, pools).deleteConsumer('sub-1')).resolves.toBeUndefined();
  });

  it('disables a consumer, and still finds and deletes the disabled account on a retry', async () => {
    const { client, send } = fakeClient((command) =>
      command instanceof AdminGetUserCommand ? { Username: 'sub-1', Enabled: false, UserAttributes: [] } : {},
    );
    await cognitoIdentity(client, pools).disableConsumer('sub-1');
    await cognitoIdentity(client, pools).deleteConsumer('sub-1');
    const commands = send.mock.calls.map(([c]) => c);
    expect(commands[1]).toBeInstanceOf(AdminDisableUserCommand);
    expect((commands[1] as AdminDisableUserCommand).input).toEqual({ UserPoolId: 'consumer-pool', Username: 'sub-1' });
    expect(commands[3]).toBeInstanceOf(AdminDeleteUserCommand);
  });

  it('creates a merchant with the email as username and returns its sub', async () => {
    const { client, send } = fakeClient(() => ({ User: { Username: 'uuid-1', Attributes: [{ Name: 'sub', Value: 'uuid-1' }] } }));
    expect(await cognitoIdentity(client, pools).createMerchant('owner@example.com')).toBe('uuid-1');
    const command = send.mock.calls[0]![0] as AdminCreateUserCommand;
    expect(command.input).toMatchObject({
      UserPoolId: 'merchant-pool',
      Username: 'owner@example.com',
      UserAttributes: expect.arrayContaining([{ Name: 'email', Value: 'owner@example.com' }, { Name: 'email_verified', Value: 'true' }]),
      DesiredDeliveryMediums: ['EMAIL'],
    });
  });

  it('maps UsernameExistsException to MerchantEmailTakenError', async () => {
    const { client } = fakeClient(() => {
      throw new UsernameExistsException({ message: 'exists', $metadata: {} });
    });
    await expect(cognitoIdentity(client, pools).createMerchant('owner@example.com')).rejects.toBeInstanceOf(MerchantEmailTakenError);
  });

  it('deletes a merchant by sub, ignoring one that is already gone', async () => {
    const { client, send } = fakeClient(() => {
      throw new UserNotFoundException({ message: 'gone', $metadata: {} });
    });
    await expect(cognitoIdentity(client, pools).deleteMerchant('uuid-1')).resolves.toBeUndefined();
    expect((send.mock.calls[0]![0] as AdminDeleteUserCommand).input).toEqual({ UserPoolId: 'merchant-pool', Username: 'uuid-1' });
  });
});

describe('fixtureIdentity', () => {
  it('finds fixture consumers only', async () => {
    expect(await fixtureIdentity.getConsumer('local-consumer-1')).toEqual({ sub: 'local-consumer-1', displayName: 'Alex' });
    expect(await fixtureIdentity.getConsumer('local-merchant-1')).toBeNull();
    expect(await fixtureIdentity.getConsumer('nobody')).toBeNull();
  });

  it('keeps the fixture user on delete, so it can sign in again locally', async () => {
    await fixtureIdentity.deleteConsumer('local-consumer-1');
    expect(await fixtureIdentity.getConsumer('local-consumer-1')).not.toBeNull();
  });

  it('does not create merchants (the seed script writes them directly)', async () => {
    await expect(fixtureIdentity.createMerchant('a@example.com')).rejects.toThrow();
  });
});
