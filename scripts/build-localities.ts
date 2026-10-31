// Converts the australian_postcodes CSV into src/reference/localities.json.
// Usage: node scripts/build-localities.ts <path/to/australian_postcodes.csv>
import { readFileSync, writeFileSync } from 'node:fs';

const STATES = new Set(['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']);

interface Locality {
  suburb: string;
  state: string;
  postcode: string;
  lat: number;
  lng: number;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}

// shortcut: plain word capitalisation gives "Mckinnon" for MCKINNON; add an exceptions list if the apps need exact casing.
function titleCase(name: string): string {
  return name.toLowerCase().replace(/(^|[\s\-'(])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

function coord(precise: string | undefined, rough: string | undefined): number {
  const value = Number(precise) || Number(rough);
  return Math.round(value * 1e4) / 1e4;
}

const csvPath = process.argv[2];
if (!csvPath) throw new Error('usage: node scripts/build-localities.ts <australian_postcodes.csv>');

const [header, ...rows] = readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
const columns = parseCsvLine(header!);
const col = (name: string) => {
  const index = columns.indexOf(name);
  if (index < 0) throw new Error(`missing column ${name}`);
  return index;
};
const [iPostcode, iLocality, iState, iLng, iLat, iType, iLatPrecise, iLngPrecise] =
  ['postcode', 'locality', 'state', 'long', 'lat', 'type', 'Lat_precise', 'Long_precise'].map(col);

const byKey = new Map<string, Locality>();
for (const row of rows) {
  const r = parseCsvLine(row);
  if (r.length !== columns.length) throw new Error(`bad row: ${row.slice(0, 80)}`);
  // PO boxes and large-volume receivers are not places a consumer stands in.
  if (r[iType!] !== 'Delivery Area' || !STATES.has(r[iState!]!)) continue;
  const lat = coord(r[iLatPrecise!], r[iLat!]);
  const lng = coord(r[iLngPrecise!], r[iLng!]);
  if (lat === 0 || lng === 0) continue;
  const locality = { suburb: titleCase(r[iLocality!]!), state: r[iState!]!, postcode: r[iPostcode!]!, lat, lng };
  byKey.set(`${locality.suburb}|${locality.state}|${locality.postcode}`, locality);
}

const localities = [...byKey.values()].sort(
  (a, b) => a.suburb.localeCompare(b.suburb) || a.state.localeCompare(b.state) || a.postcode.localeCompare(b.postcode),
);
writeFileSync(new URL('../src/reference/localities.json', import.meta.url), JSON.stringify(localities) + '\n');
console.log(`wrote ${localities.length} localities`);
