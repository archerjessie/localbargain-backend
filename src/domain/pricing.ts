// Integer maths only, so no float rounding: (original × (100 − percent) + 50) / 100, floored, rounds half up (design D5).
export function discountedPriceCents(originalPriceCents: number, percentOff: number): number {
  return Math.floor((originalPriceCents * (100 - percentOff) + 50) / 100);
}
