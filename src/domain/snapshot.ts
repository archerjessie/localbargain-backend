import type { Consumer } from '../identity/identity.js';
import { discountedPriceCents } from './pricing.js';
import type { MerchantProfile, Offer, Redemption } from './types.js';

// List prices at scan time only. No payment, transaction, or amount-paid fields (redemptions spec).
export function snapshotRedemption(input: {
  redemptionId: string;
  redeemedAt: string;
  merchant: MerchantProfile;
  offer: Offer;
  consumer: Consumer;
}): Redemption {
  const { merchant, offer, consumer } = input;
  if (offer.merchantId !== merchant.merchantId) throw new Error('offer does not belong to merchant');
  return {
    redemptionId: input.redemptionId,
    redeemedAt: input.redeemedAt,
    merchantId: merchant.merchantId,
    merchantName: merchant.name,
    userId: consumer.sub,
    // No display name is stored when there is none, so anonymised and nameless redemptions look the same.
    ...(consumer.displayName ? { displayName: consumer.displayName } : {}),
    offerId: offer.offerId,
    productName: offer.productName,
    categoryId: offer.categoryId,
    percentOff: offer.percentOff,
    originalPriceCents: offer.originalPriceCents,
    discountedPriceCents: discountedPriceCents(offer.originalPriceCents, offer.percentOff),
  };
}
