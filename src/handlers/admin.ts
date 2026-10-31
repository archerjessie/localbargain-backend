// Admin Lambda: creates merchant accounts. Called with SigV4 through the IAM authorizer (design D3).
import { putMerchantProfile } from '../data/merchants.js';
import { errorResponse } from '../domain/errors.js';
import { geohash } from '../domain/geo.js';
import { json } from '../domain/responses.js';
import type { MerchantProfile } from '../domain/types.js';
import { merchantCreate, parseJsonBody } from '../domain/validation.js';
import { identity, MerchantEmailTakenError, type Identity } from '../identity/identity.js';
import { router, type Route } from './router.js';

export function createMerchantRoute(deps: {
  identity: Identity;
  saveProfile: (profile: MerchantProfile) => Promise<void>;
  now: () => string;
}): Route {
  return async (event) => {
    const body = parseJsonBody(merchantCreate, event.body, event.isBase64Encoded);
    if (!body.ok) return body.response;
    const { email, ...shop } = body.data;

    let merchantId: string;
    try {
      // The merchant pool uses email as the username, so Cognito itself rejects a duplicate (design D5).
      merchantId = await deps.identity.createMerchant(email);
    } catch (error) {
      if (error instanceof MerchantEmailTakenError) return errorResponse(409, 'conflict', 'A merchant with this login email already exists');
      throw error;
    }

    try {
      await deps.saveProfile({ ...shop, merchantId, geohash: geohash(shop.lat, shop.lng), createdAt: deps.now() });
    } catch (error) {
      // No account without a shop: undo the sign-up, then let the router answer 500.
      await deps.identity.deleteMerchant(merchantId);
      throw error;
    }
    return json(201, { merchantId });
  };
}

let createMerchant: Route | undefined;

export const handler = router({
  'POST /admin/merchants': (event) => {
    createMerchant ??= createMerchantRoute({ identity: identity(), saveProfile: putMerchantProfile, now: () => new Date().toISOString() });
    return createMerchant(event);
  },
});
