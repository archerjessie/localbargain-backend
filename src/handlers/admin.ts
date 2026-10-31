// Admin Lambda: creates merchant accounts. Called with SigV4 through the IAM authorizer (design D3).
import type { APIGatewayProxyEventV2WithIAMAuthorizer } from 'aws-lambda';
import { merchantProfileExists, putMerchantProfile } from '../data/merchants.js';
import { errorResponse } from '../domain/errors.js';
import { geohash } from '../domain/geo.js';
import { json } from '../domain/responses.js';
import type { MerchantProfile } from '../domain/types.js';
import { merchantCreate, parseJsonBody } from '../domain/validation.js';
import { identity, MerchantEmailTakenError, type Identity } from '../identity/identity.js';
import { router, type Route } from './router.js';

type AdminEvent = APIGatewayProxyEventV2WithIAMAuthorizer;

export function createMerchantRoute(deps: {
  identity: Identity;
  saveProfile: (profile: MerchantProfile) => Promise<void>;
  profileExists: (merchantId: string) => Promise<boolean>;
  now: () => string;
}): Route<AdminEvent> {
  return async (event) => {
    const body = parseJsonBody(merchantCreate, event.body, event.isBase64Encoded);
    if (!body.ok) return body.response;
    const { email, ...shop } = body.data;
    const profileFor = (merchantId: string): MerchantProfile => ({
      ...shop,
      merchantId,
      geohash: geohash(shop.lat, shop.lng),
      createdAt: deps.now(),
    });

    let merchantId: string;
    try {
      // The merchant pool uses email as the username, so Cognito itself rejects a duplicate (design D5).
      merchantId = await deps.identity.createMerchant(email);
    } catch (error) {
      if (!(error instanceof MerchantEmailTakenError)) throw error;
      // A create that crashed after AdminCreateUser leaves an account with no shop. Repair it, so a retry succeeds.
      const existing = await deps.identity.findMerchantSub(email);
      if (!existing || (await deps.profileExists(existing))) {
        return errorResponse(409, 'conflict', 'A merchant with this login email already exists');
      }
      await deps.saveProfile(profileFor(existing));
      return json(201, { merchantId: existing });
    }

    try {
      await deps.saveProfile(profileFor(merchantId));
    } catch (error) {
      // No account without a shop: undo the sign-up, then let the router answer 500 with the original error.
      // Accepted risk: Cognito has already emailed the temporary password for the account deleted here.
      try {
        await deps.identity.deleteMerchant(merchantId);
      } catch (rollbackError) {
        console.error(`Rollback failed: merchant account ${merchantId} has no shop profile`, rollbackError);
      }
      throw error;
    }
    return json(201, { merchantId });
  };
}

const createMerchant = createMerchantRoute({
  identity: identity(),
  saveProfile: putMerchantProfile,
  profileExists: merchantProfileExists,
  now: () => new Date().toISOString(),
});

export const handler = router<AdminEvent>({ 'POST /admin/merchants': createMerchant });
