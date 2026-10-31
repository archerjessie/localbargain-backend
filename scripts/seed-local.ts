// npm run seed:local — fills DynamoDB Local and MinIO for local mode (design D9). Safe to run again: it replaces the seed items.
import { CreateTableCommand, DescribeTableCommand, ResourceNotFoundException } from '@aws-sdk/client-dynamodb';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dynamoClient, s3Client } from '../src/data/clients.js';
import { merchantProfileItem, offerItem } from '../src/data/items.js';
import { tableDefinition } from '../src/data/table.js';
import { geohash } from '../src/domain/geo.js';
import { signQr } from '../src/domain/qr.js';
import type { MerchantProfile, Offer } from '../src/domain/types.js';

const { Parameters: localEnv } = JSON.parse(readFileSync(new URL('../local/env.json', import.meta.url), 'utf8')) as {
  Parameters: Record<string, string>;
};

// The script runs on the host, so it reaches Docker on localhost rather than the Docker-network names in env.json.
Object.assign(process.env, {
  TABLE_NAME: localEnv.TABLE_NAME,
  DYNAMODB_ENDPOINT: 'http://localhost:8000',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY_ID: localEnv.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: localEnv.S3_SECRET_ACCESS_KEY,
});
const table = localEnv.TABLE_NAME!;
const bucket = localEnv.IMAGE_BUCKET!;
const createdAt = '2026-01-01T00:00:00.000Z';

const merchant = (m: Omit<MerchantProfile, 'geohash' | 'createdAt'>): MerchantProfile => ({
  ...m,
  geohash: geohash(m.lat, m.lng),
  createdAt,
});
const offer = (o: Omit<Offer, 'createdAt' | 'updatedAt'>): Offer => ({ ...o, createdAt, updatedAt: createdAt });

// The merchant IDs are the fixture merchant subs in local/users.json, so x-debug-sub: local-merchant-1 owns this shop.
const merchants = [
  merchant({
    merchantId: 'local-merchant-1', name: 'Bean There', shopType: 'cafe', street: '211 Swanston St',
    suburb: 'Melbourne', state: 'VIC', postcode: '3000', lat: -37.8117, lng: 144.9652,
  }),
  merchant({
    merchantId: 'local-merchant-2', name: 'Harbour Bakery', shopType: 'bakery', street: '12 George St',
    suburb: 'The Rocks', state: 'NSW', postcode: '2000', lat: -33.8599, lng: 151.2090,
  }),
];

const imageKey = 'offers/local-merchant-1/local-offer-1/seed.png';
const offers = [
  offer({
    offerId: 'local-offer-1', merchantId: 'local-merchant-1', productName: 'Flat white', categoryId: 'coffee',
    percentOff: 20, originalPriceCents: 450, description: 'Any size, any milk', imageKey, active: true,
  }),
  offer({
    offerId: 'local-offer-2', merchantId: 'local-merchant-1', productName: 'Banana bread', categoryId: 'bakery',
    percentOff: 15, originalPriceCents: 650, active: true,
  }),
  offer({
    offerId: 'local-offer-3', merchantId: 'local-merchant-1', productName: 'Iced chocolate', categoryId: 'drinks',
    percentOff: 30, originalPriceCents: 700, active: false,
  }),
  offer({
    offerId: 'local-offer-4', merchantId: 'local-merchant-2', productName: 'Sourdough loaf', categoryId: 'bakery',
    percentOff: 25, originalPriceCents: 900, active: true,
  }),
  offer({
    offerId: 'local-offer-5', merchantId: 'local-merchant-2', productName: 'Meat pie', categoryId: 'meals',
    percentOff: 10, originalPriceCents: 750, active: false,
  }),
];

// A 64 x 64 solid-colour PNG, built here so the repo needs no binary file.
function samplePng(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    typed.copy(out, 4);
    out.writeUInt32BE(crc(typed), 8 + data.length);
    return out;
  };
  const size = 64;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [0x6f, 0x4e, 0x37]).flat())]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function ensureTable() {
  const db = dynamoClient();
  try {
    await db.send(new DescribeTableCommand({ TableName: table }));
    console.log(`table ${table} exists`);
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
    await db.send(new CreateTableCommand(tableDefinition(table)));
    console.log(`created table ${table}`);
  }
}

await ensureTable();
for (const item of [...merchants.map(merchantProfileItem), ...offers.map(offerItem)]) {
  await dynamoClient().send(new PutCommand({ TableName: table, Item: item }));
}
console.log(`wrote ${merchants.length} merchants and ${offers.length} offers (${offers.filter((o) => o.active).length} active)`);

await s3Client().send(new PutObjectCommand({ Bucket: bucket, Key: imageKey, Body: samplePng(), ContentType: 'image/png' }));
console.log(`uploaded ${imageKey}`);
console.log(`imageUrl: ${localEnv.IMAGE_BASE_URL}${imageKey}`);

// For testing scans on an emulator with no camera: paste this into the merchant app's manual entry.
const qrValue = signQr(Buffer.from(localEnv.QR_KEY!, 'base64'), 'local-consumer-1', 'local-offer-1');
console.log(`qrValue (local-consumer-1, Flat white at Bean There): ${qrValue}`);
