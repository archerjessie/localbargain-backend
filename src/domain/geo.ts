export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_METRES = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

// Haversine great-circle distance.
export function distanceMetres(a: Point, b: Point): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(h));
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function geohash(lat: number, lng: number, length = 9): string {
  const range = { lat: [-90, 90], lng: [-180, 180] };
  let hash = '';
  let bits = 0;
  let value = 0;
  let evenBit = true; // Geohash interleaves bits, starting with longitude.
  while (hash.length < length) {
    const [axis, coordinate] = evenBit ? (['lng', lng] as const) : (['lat', lat] as const);
    const [min, max] = range[axis] as [number, number];
    const mid = (min + max) / 2;
    value <<= 1;
    if (coordinate >= mid) {
      value |= 1;
      range[axis] = [mid, max];
    } else {
      range[axis] = [min, mid];
    }
    evenBit = !evenBit;
    if (++bits === 5) {
      hash += BASE32[value];
      bits = 0;
      value = 0;
    }
  }
  return hash;
}
