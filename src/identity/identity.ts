// Every Cognito call goes through this module, so local mode can swap in the fixture (design D9).
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  UsernameExistsException,
  UserNotFoundException,
  type AttributeType,
} from '@aws-sdk/client-cognito-identity-provider';
import { findFixtureUser } from './fixture.js';
import { isLocalMode } from './localMode.js';

export interface Consumer {
  sub: string;
  displayName?: string;
}

export interface Identity {
  getConsumer(sub: string): Promise<Consumer | null>;
  disableConsumer(sub: string): Promise<void>;
  deleteConsumer(sub: string): Promise<void>;
  createMerchant(email: string): Promise<string>;
  findMerchantSub(email: string): Promise<string | null>;
  deleteMerchant(sub: string): Promise<void>;
}

export class MerchantEmailTakenError extends Error {}

const attribute = (attributes: AttributeType[] | undefined, name: string) =>
  attributes?.find((a) => a.Name === name)?.Value;

// Cognito subs are UUIDs. Rejecting anything else keeps the value from breaking out of the ListUsers filter string.
const SUB = /^[A-Za-z0-9-]+$/;

export function cognitoIdentity(
  client: CognitoIdentityProviderClient,
  pools: { consumerPoolId: string; merchantPoolId: string },
): Identity {
  async function findConsumer(sub: string): Promise<{ username: string; enabled: boolean; attributes: AttributeType[] } | null> {
    if (!SUB.test(sub)) return null;
    try {
      // A native user's username is their sub, so this one cheap call covers most consumers.
      const user = await client.send(new AdminGetUserCommand({ UserPoolId: pools.consumerPoolId, Username: sub }));
      return user.Username ? { username: user.Username, enabled: user.Enabled === true, attributes: user.UserAttributes ?? [] } : null;
    } catch (error) {
      if (!(error instanceof UserNotFoundException)) throw error;
    }
    // A Google or Apple user's username (Google_123...) is not their sub. ListUsers has a low quota, so it is only the fallback.
    const { Users } = await client.send(
      new ListUsersCommand({ UserPoolId: pools.consumerPoolId, Filter: `sub = "${sub}"`, Limit: 1, AttributesToGet: ['given_name'] }),
    );
    const user = Users?.[0];
    return user?.Username ? { username: user.Username, enabled: user.Enabled === true, attributes: user.Attributes ?? [] } : null;
  }

  return {
    // A disabled user counts as gone, so their QR codes stop working (DELETE /me disables first).
    async getConsumer(sub) {
      const user = await findConsumer(sub);
      if (!user?.enabled) return null;
      const displayName = attribute(user.attributes, 'given_name');
      return { sub, ...(displayName ? { displayName } : {}) };
    },

    async disableConsumer(sub) {
      const user = await findConsumer(sub);
      if (!user) return;
      await client.send(new AdminDisableUserCommand({ UserPoolId: pools.consumerPoolId, Username: user.username }));
    },

    // Finds the account whether or not it is disabled, so a retry after a failed DELETE /me can finish.
    async deleteConsumer(sub) {
      const user = await findConsumer(sub);
      // Already deleted: DELETE /me is safe to retry (design D5).
      if (!user) return;
      await client.send(new AdminDeleteUserCommand({ UserPoolId: pools.consumerPoolId, Username: user.username }));
    },

    async createMerchant(email) {
      try {
        const { User } = await client.send(
          new AdminCreateUserCommand({
            UserPoolId: pools.merchantPoolId,
            Username: email,
            // The admin vouches for the address, and the temporary password is sent to it.
            UserAttributes: [
              { Name: 'email', Value: email },
              { Name: 'email_verified', Value: 'true' },
            ],
            DesiredDeliveryMediums: ['EMAIL'],
          }),
        );
        const sub = attribute(User?.Attributes, 'sub');
        if (!sub) throw new Error('AdminCreateUser returned no sub');
        return sub;
      } catch (error) {
        if (error instanceof UsernameExistsException) throw new MerchantEmailTakenError(email);
        throw error;
      }
    },

    async findMerchantSub(email) {
      try {
        const user = await client.send(new AdminGetUserCommand({ UserPoolId: pools.merchantPoolId, Username: email }));
        return attribute(user.UserAttributes, 'sub') ?? null;
      } catch (error) {
        if (error instanceof UserNotFoundException) return null;
        throw error;
      }
    },

    async deleteMerchant(sub) {
      try {
        // Email-as-username pools give each user a username equal to its sub.
        await client.send(new AdminDeleteUserCommand({ UserPoolId: pools.merchantPoolId, Username: sub }));
      } catch (error) {
        if (!(error instanceof UserNotFoundException)) throw error;
      }
    },
  };
}

export const fixtureIdentity: Identity = {
  async getConsumer(sub) {
    const user = findFixtureUser(sub, 'consumer');
    return user ? { sub: user.sub, displayName: user.displayName } : null;
  },
  // shortcut: local DELETE /me anonymises redemptions but keeps the fixture user, so the account can sign in again locally
  async disableConsumer() {},
  async deleteConsumer() {},
  async createMerchant() {
    throw new Error('Admin routes are not used in local mode; seed-local.ts writes merchants directly');
  },
  async findMerchantSub() {
    return null;
  },
  async deleteMerchant() {},
};

let cached: Identity | undefined;

export function identity(): Identity {
  cached ??= isLocalMode()
    ? fixtureIdentity
    : cognitoIdentity(new CognitoIdentityProviderClient({}), {
        consumerPoolId: process.env.CONSUMER_USER_POOL_ID ?? '',
        merchantPoolId: process.env.MERCHANT_USER_POOL_ID ?? '',
      });
  return cached;
}
