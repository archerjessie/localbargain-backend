// Consumer Lambda: the signed-in consumer's profile, QR codes, history, and account deletion (design D2).
import { getOffer } from '../data/offers.js';
import { qrKey } from '../data/qrKey.js';
import { errorResponse } from '../domain/errors.js';
import { signQr } from '../domain/qr.js';
import { json } from '../domain/responses.js';
import { getCaller } from '../identity/caller.js';
import { router } from './router.js';

export const handler = router({
  // The profile lives in Cognito, so the ID token claims are the whole answer (design D4).
  'GET /me': async (event) => {
    const caller = getCaller(event, 'consumer');
    if (!caller.ok) return caller.response;
    const { sub, email, displayName } = caller.caller;
    return json(200, { userId: sub, email, displayName: displayName ?? null });
  },

  // Design D10: the merchantId in the path finds the offer, which is keyed by merchant. Only active offers get a code.
  'GET /merchants/{merchantId}/offers/{offerId}/qr': async (event) => {
    const caller = getCaller(event, 'consumer');
    if (!caller.ok) return caller.response;
    // Start the key load (SSM on a cold start) alongside the offer read. A 404 leaves it cached for the next request.
    const key = qrKey();
    key.catch(() => {});
    const offer = await getOffer(event.pathParameters?.merchantId ?? '', event.pathParameters?.offerId ?? '');
    if (!offer?.active) return errorResponse(404, 'not_found', 'Offer not found or not active');
    return json(200, { qrValue: signQr(await key, caller.caller.sub, offer.offerId) });
  },
});
