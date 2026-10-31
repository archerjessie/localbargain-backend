// Merchant Lambda: the signed-in merchant's shop, offers, and redemptions (design D2).
import { getMerchantProfile } from '../data/merchants.js';
import { errorResponse } from '../domain/errors.js';
import { json } from '../domain/responses.js';
import { merchantView } from '../domain/views.js';
import { getCaller } from '../identity/caller.js';
import { router } from './router.js';

export const handler = router({
  'GET /merchant/me': async (event) => {
    const caller = getCaller(event, 'merchant');
    if (!caller.ok) return caller.response;
    // merchantId is the merchant pool sub (design D3).
    const profile = await getMerchantProfile(caller.caller.sub);
    if (!profile) return errorResponse(404, 'not_found', 'No shop profile for this merchant account');
    return json(200, merchantView(profile));
  },
});
