import { discountedPriceCents } from './pricing.js';
import type { MerchantProfile, Offer, Redemption } from './types.js';

// List prices at scan time only. No payment, transaction, or amount-paid fields (redemptions spec).
export function snapshotRedemption(input: {
  redemptionId: string;
  redeemedAt: string;
  merchant: MerchantProfile;
  offer: Offer;
  consumer: { userId: string; displayName?: string };
}): Redemption {
  const { merchant, offer, consumer } = input;
  if (offer.merchantId !== merchant.merchantId) throw new Error('offer does not belong to merchant');
  return {
    redemptionId: input.redemptionId,
    redeemedAt: input.redeemedAt,
    merchantId: merchant.merchantId,
    merchantName: merchant.name,
    userId: consumer.userId,
    ...(consumer.displayName === undefined ? {} : { displayName: consumer.displayName }),
    offerId: offer.offerId,
    productName: offer.productName,
    categoryId: offer.categoryId,
    percentOff: offer.percentOff,
    originalPriceCents: offer.originalPriceCents,
    discountedPriceCents: discountedPriceCents(offer.originalPriceCents, offer.percentOff),
  };
}
