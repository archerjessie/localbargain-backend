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
    const list = activeByMerchant.get(offer.merchantId);
    if (list) list.push(offer);
    else activeByMerchant.set(offer.merchantId, [offer]);
  }
  return profiles
    .flatMap((merchant) => {
      const active = activeByMerchant.get(merchant.merchantId);
      if (!active) return [];
      const distance = distanceMetres(at, merchant);
      return distance <= radiusMetres ? [{ merchant, offers: active, distanceMetres: Math.round(distance) }] : [];
    })
    .sort((a, b) => a.distanceMetres - b.distanceMetres)
    .slice(0, MAX_MERCHANTS);
}
