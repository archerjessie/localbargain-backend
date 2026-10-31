// Stored item attributes from design D5, without the DynamoDB keys.
import type { CategoryId } from '../reference/categories.js';
import type { ShopType } from '../reference/shopTypes.js';

export interface MerchantProfile {
  merchantId: string;
  name: string;
  shopType: ShopType;
  street: string;
  suburb: string;
  state: string;
  postcode: string;
  lat: number;
  lng: number;
  geohash: string;
  createdAt: string;
}

export interface Offer {
  offerId: string;
  merchantId: string;
  productName: string;
  categoryId: CategoryId;
  percentOff: number;
  originalPriceCents: number;
  description?: string;
  imageKey?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Redemption {
  redemptionId: string;
  redeemedAt: string;
  merchantId: string;
  merchantName: string;
  userId?: string;
  displayName?: string;
  offerId: string;
  productName: string;
  categoryId: CategoryId;
  percentOff: number;
  originalPriceCents: number;
  discountedPriceCents: number;
}
