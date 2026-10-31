import { distanceMetres, type Point } from './geo.js';
import type { MerchantProfile, Offer } from './types.js';

const MAX_MERCHANTS = 100;

export interface DiscoveredMerchant {
  merchant: MerchantProfile;
  offers: Offer[];
  distanceMetres: number;
}

export function discover(
  profiles: readonly MerchantProfile[],
  offers: readonly Offer[],
  at: Point,
  radiusMetres: number,
): DiscoveredMerchant[] {
  const activeByMerchant = new Map<string, Offer[]>();
  for (const offer of offers) {
    if (!offer.active) continue;
    activeByMerchant.set(offer.merchantId, [...(activeByMerchant.get(offer.merchantId) ?? []), offer]);
  }
  return profiles
    .flatMap((merchant) => {
      const active = activeByMerchant.get(merchant.merchantId);
      if (!active) return [];
      const distance = Math.round(distanceMetres(at, merchant));
      return distance <= radiusMetres ? [{ merchant, offers: active, distanceMetres: distance }] : [];
    })
    .sort((a, b) => a.distanceMetres - b.distanceMetres)
    .slice(0, MAX_MERCHANTS);
}
