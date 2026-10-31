// DynamoDB item shapes from design D5: domain values plus their table and index keys.
import type { MerchantProfile, Offer, Redemption } from '../domain/types.js';

const KEYS = ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK'] as const;
type Keyed<T> = T & { PK: string; SK: string; GSI1PK?: string; GSI1SK?: string; GSI2PK?: string; GSI2SK?: string };

const merchantPk = (merchantId: string) => `MERCHANT#${merchantId}`;

export const profileKey = (merchantId: string) => ({ PK: merchantPk(merchantId), SK: 'PROFILE' });
export const offerKey = (merchantId: string, offerId: string) => ({ PK: merchantPk(merchantId), SK: `OFFER#${offerId}` });

export function merchantProfileItem(profile: MerchantProfile): Keyed<MerchantProfile> {
  const key = profileKey(profile.merchantId);
  return { ...profile, ...key, GSI2PK: 'DISCOVERY', GSI2SK: `${key.PK}#${key.SK}` };
}

// GSI2 keys only while active, so a deactivated offer drops out of discovery by itself.
export function offerItem(offer: Offer): Keyed<Offer> {
  const key = offerKey(offer.merchantId, offer.offerId);
  return offer.active ? { ...offer, ...key, GSI2PK: 'DISCOVERY', GSI2SK: `${key.PK}#${key.SK}` } : { ...offer, ...key };
}

// Shop history sorts by SK, consumer history by GSI1SK. An anonymised redemption has no GSI1 keys (design D5).
export function redemptionItem(redemption: Redemption): Keyed<Redemption> {
  const at = `${redemption.redeemedAt}#${redemption.redemptionId}`;
  return {
    ...redemption,
    PK: merchantPk(redemption.merchantId),
    SK: `REDEMPTION#${at}`,
    ...(redemption.userId ? { GSI1PK: `USER#${redemption.userId}`, GSI1SK: at } : {}),
  };
}

function withoutKeys<T>(item: object): T {
  const value: Record<string, unknown> = { ...item };
  for (const key of KEYS) delete value[key];
  return value as T;
}

export const profileFromItem = (item: object) => withoutKeys<MerchantProfile>(item);
export const offerFromItem = (item: object) => withoutKeys<Offer>(item);
export const redemptionFromItem = (item: object) => withoutKeys<Redemption>(item);
