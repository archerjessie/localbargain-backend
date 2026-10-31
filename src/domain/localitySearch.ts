export interface Locality {
  suburb: string;
  state: string;
  postcode: string;
  lat: number;
  lng: number;
}

export const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 20;

// Returns null for a query shorter than MIN_QUERY_LENGTH, which the handler turns into a 400.
export function searchLocalities(query: string, localities: readonly Locality[]): Locality[] | null {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY_LENGTH) return null;
  if (/^\d{4}$/.test(q)) return localities.filter((l) => l.postcode === q).slice(0, MAX_RESULTS);
  const matches = localities.filter((l) => l.suburb.toLowerCase().startsWith(q));
  const exact = matches.filter((l) => l.suburb.toLowerCase() === q);
  const rest = matches.filter((l) => l.suburb.toLowerCase() !== q);
  return [...exact, ...rest].slice(0, MAX_RESULTS);
}
