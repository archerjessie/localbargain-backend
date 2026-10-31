// Platform-owned list (design D6). Mirrors the `ShopType` enum in openapi.yaml.
export const shopTypes = [
  'cafe', 'restaurant', 'bakery', 'bar', 'retail', 'beauty', 'services', 'other',
] as const;

export type ShopType = (typeof shopTypes)[number];
