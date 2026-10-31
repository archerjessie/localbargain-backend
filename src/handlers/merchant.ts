// Merchant Lambda: the signed-in merchant's shop, offers, and redemptions (design D2).
import { randomUUID } from 'node:crypto';
import { imageBaseUrl } from '../data/clients.js';
import { createImageUpload, deleteImage, imageExists, imageKeyPrefix } from '../data/images.js';
import { getMerchantProfile, merchantProfileExists } from '../data/merchants.js';
import { deleteOffer, getOffer, listOffers, OfferChangedError, putOffer } from '../data/offers.js';
import { errorResponse } from '../domain/errors.js';
import { json, noContent } from '../domain/responses.js';
import type { Offer } from '../domain/types.js';
import { imageUploadRequest, offerCreate, offerUpdate, parseJsonBody } from '../domain/validation.js';
import { merchantView, offerView } from '../domain/views.js';
import { getCaller } from '../identity/caller.js';
import { router } from './router.js';

const offerNotFound = () => errorResponse(404, 'not_found', 'Offer not found');

export const handler = router({
  'GET /merchant/me': async (event) => {
    const caller = getCaller(event, 'merchant');
    if (!caller.ok) return caller.response;
    // merchantId is the merchant pool sub (design D3).
    const profile = await getMerchantProfile(caller.caller.sub);
    if (!profile) return errorResponse(404, 'not_found', 'No shop profile for this merchant account');
    return json(200, merchantView(profile));
  },

  'GET /merchant/offers': async (event) => {
    const caller = getCaller(event, 'merchant');
    if (!caller.ok) return caller.response;
    const offers = await listOffers(caller.caller.sub);
    return json(200, { items: offers.map((offer) => offerView(offer, imageBaseUrl())) });
  },

  'POST /merchant/offers': async (event) => {
    const caller = getCaller(event, 'merchant');
    if (!caller.ok) return caller.response;
    const body = parseJsonBody(offerCreate, event.body, event.isBase64Encoded);
    if (!body.ok) return body.response;
    // An offer without a shop profile would never show in discovery.
    if (!(await merchantProfileExists(caller.caller.sub))) {
      return errorResponse(404, 'not_found', 'No shop profile for this merchant account');
    }
    const now = new Date().toISOString();
    const { description, ...fields } = body.data;
    const offer: Offer = {
      ...fields,
      ...(description ? { description } : {}),
      offerId: randomUUID(),
      merchantId: caller.caller.sub,
      createdAt: now,
      updatedAt: now,
    };
    await putOffer(offer, { create: true });
    return json(201, offerView(offer, imageBaseUrl()));
  },

  'PATCH /merchant/offers/{offerId}': async (event) => {
    const caller = getCaller(event, 'merchant');
    if (!caller.ok) return caller.response;
    const body = parseJsonBody(offerUpdate, event.body, event.isBase64Encoded);
    if (!body.ok) return body.response;
    const current = await getOffer(caller.caller.sub, event.pathParameters?.offerId ?? '');
    if (!current) return offerNotFound();
    const { description, imageKey, ...fields } = body.data;
    if (typeof imageKey === 'string' && imageKey !== current.imageKey) {
      // Only a key issued for this merchant and offer, and only once its upload exists (design D11).
      if (!imageKey.startsWith(imageKeyPrefix(current.merchantId, current.offerId)) || !(await imageExists(imageKey))) {
        return errorResponse(400, 'validation_error', 'imageKey was not issued for this offer, or its upload does not exist');
      }
    }
    // zod types optional keys as `T | undefined`. Dropping undefined values lets the merge satisfy exactOptionalPropertyTypes.
    const changes = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<Offer>;
    const updated: Offer = { ...current, ...changes, updatedAt: new Date().toISOString() };
    if (description === null) delete updated.description;
    else if (description !== undefined) updated.description = description;
    if (imageKey === null) delete updated.imageKey;
    else if (imageKey !== undefined) updated.imageKey = imageKey;
    try {
      await putOffer(updated, { expectedUpdatedAt: current.updatedAt });
    } catch (error) {
      if (!(error instanceof OfferChangedError)) throw error;
      // Deleted or changed by another request since the read above.
      if (!(await getOffer(current.merchantId, current.offerId))) return offerNotFound();
      return errorResponse(409, 'conflict', 'The offer changed while this update was in progress. Fetch it again and retry.');
    }
    // Only after the write succeeds, so a failed write never leaves the offer pointing at a deleted image.
    if (current.imageKey && current.imageKey !== updated.imageKey) await deleteImage(current.imageKey);
    return json(200, offerView(updated, imageBaseUrl()));
  },

  'DELETE /merchant/offers/{offerId}': async (event) => {
    const caller = getCaller(event, 'merchant');
    if (!caller.ok) return caller.response;
    // Redemptions copied the offer's values at scan time, so deleting it leaves them unchanged.
    const deleted = await deleteOffer(caller.caller.sub, event.pathParameters?.offerId ?? '');
    if (!deleted) return offerNotFound();
    if (deleted.imageKey) await deleteImage(deleted.imageKey);
    return noContent();
  },

  'POST /merchant/offers/{offerId}/image': async (event) => {
    const caller = getCaller(event, 'merchant');
    if (!caller.ok) return caller.response;
    const body = parseJsonBody(imageUploadRequest, event.body, event.isBase64Encoded);
    if (!body.ok) return body.response;
    const offer = await getOffer(caller.caller.sub, event.pathParameters?.offerId ?? '');
    if (!offer) return offerNotFound();
    return json(201, await createImageUpload(offer.merchantId, offer.offerId, body.data.contentType));
  },
});
