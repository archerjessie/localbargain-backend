// Every Cognito call goes through this module, so local mode can swap in the fixture (design D9).
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
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
  deleteConsumer(sub: string): Promise<void>;
  createMerchant(email: string): Promise<string>;
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
  // Look up by sub, not username: a Google or Apple user's username (Google_123...) is not their sub.
  async function findConsumer(sub: string) {
    if (!SUB.test(sub)) return null;
    const { Users } = await client.send(
      new ListUsersCommand({ UserPoolId: pools.consumerPoolId, Filter: `sub = "${sub}"`, Limit: 1 }),
    );
    return Users?.[0] ?? null;
  }

  return {
    async getConsumer(sub) {
      const user = await findConsumer(sub);
      if (!user) return null;
      const displayName = attribute(user.Attributes, 'given_name');
      return { sub, ...(displayName ? { displayName } : {}) };
    },

    async deleteConsumer(sub) {
      const user = await findConsumer(sub);
      // Already deleted: DELETE /me is safe to retry (design D5).
      if (!user?.Username) return;
      await client.send(new AdminDeleteUserCommand({ UserPoolId: pools.consumerPoolId, Username: user.Username }));
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
  async deleteConsumer() {},
  async createMerchant() {
    throw new Error('Admin routes are not used in local mode; seed-local.ts writes merchants directly');
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
