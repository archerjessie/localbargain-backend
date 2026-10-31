// Response shapes from openapi.yaml. Stored-only fields (geohash, imageKey, keys) never reach clients.
import { discountedPriceCents } from './pricing.js';
import type { MerchantProfile, Offer, Redemption } from './types.js';

export function merchantView(profile: MerchantProfile) {
  const { merchantId, name, shopType, street, suburb, state, postcode, lat, lng } = profile;
  return { merchantId, name, shopType, street, suburb, state, postcode, lat, lng };
}

// imageUrl is built on read (design D11), so changing the CDN domain needs no data change.
export function offerView(offer: Offer, imageBaseUrl: string) {
  return {
    offerId: offer.offerId,
    merchantId: offer.merchantId,
    productName: offer.productName,
    categoryId: offer.categoryId,
    percentOff: offer.percentOff,
    originalPriceCents: offer.originalPriceCents,
    discountedPriceCents: discountedPriceCents(offer.originalPriceCents, offer.percentOff),
    description: offer.description ?? null,
    imageUrl: offer.imageKey ? `${imageBaseUrl}${offer.imageKey}` : null,
    active: offer.active,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
}

const redemptionBase = (r: Redemption) => ({
  redemptionId: r.redemptionId,
  redeemedAt: r.redeemedAt,
  merchantId: r.merchantId,
  offerId: r.offerId,
  productName: r.productName,
  categoryId: r.categoryId,
  percentOff: r.percentOff,
  originalPriceCents: r.originalPriceCents,
  discountedPriceCents: r.discountedPriceCents,
});

// The shop sees the consumer's display name only: never their user ID, email, or contact details.
export const merchantRedemptionView = (r: Redemption) => ({ ...redemptionBase(r), displayName: r.displayName ?? null });

export const consumerRedemptionView = (r: Redemption) => ({ ...redemptionBase(r), merchantName: r.merchantName });
