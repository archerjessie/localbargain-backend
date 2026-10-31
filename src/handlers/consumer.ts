// Consumer Lambda: the signed-in consumer's profile, QR codes, history, and account deletion (design D2).
import { consumerHistory, InvalidCursorError } from '../data/history.js';
import { getOffer } from '../data/offers.js';
import { qrKey } from '../data/qrKey.js';
import { anonymiseConsumer } from '../data/redemptions.js';
import { errorResponse } from '../domain/errors.js';
import { signQr } from '../domain/qr.js';
import { json, noContent } from '../domain/responses.js';
import { cursorQuery, parseRequest } from '../domain/validation.js';
import { consumerRedemptionView } from '../domain/views.js';
import { getCaller } from '../identity/caller.js';
import { identity } from '../identity/identity.js';
import { router } from './router.js';

export const handler = router({
  // The profile lives in Cognito, so the ID token claims are the whole answer (design D4).
  'GET /me': async (event) => {
    const caller = getCaller(event, 'consumer');
    if (!caller.ok) return caller.response;
    const { sub, email, displayName } = caller.caller;
    return json(200, { userId: sub, email, displayName: displayName ?? null });
  },

  // Design D5 order, plus a disable first: a disabled consumer counts as gone, so no scan can record a new linked
  // redemption while the old ones are anonymised. A failure part-way leaves an account that can retry with its still-valid
  // token, never personal data with no account. A retry finds nothing left to anonymise and deletes the user.
  'DELETE /me': async (event) => {
    const caller = getCaller(event, 'consumer');
    if (!caller.ok) return caller.response;
    await identity().disableConsumer(caller.caller.sub);
    await anonymiseConsumer(caller.caller.sub);
    await identity().deleteConsumer(caller.caller.sub);
    return noContent();
  },

  'GET /me/redemptions': async (event) => {
    const caller = getCaller(event, 'consumer');
    if (!caller.ok) return caller.response;
    const query = parseRequest(cursorQuery, event.queryStringParameters ?? {});
    if (!query.ok) return query.response;
    try {
      const { items, nextCursor } = await consumerHistory(caller.caller.sub, query.data.cursor);
      return json(200, { items: items.map(consumerRedemptionView), ...(nextCursor ? { nextCursor } : {}) });
    } catch (error) {
      if (error instanceof InvalidCursorError) return errorResponse(400, 'validation_error', 'cursor is not a valid cursor for this history');
      throw error;
    }
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
