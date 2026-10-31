import { CreateTableCommand, DeleteTableCommand } from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'node:crypto';
import { dynamoClient, tableName } from '../../src/data/clients.js';
import { tableDefinition } from '../../src/data/table.js';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { merchantProfileItem, offerItem } from '../../src/data/items.js';

import type { MerchantProfile, Offer } from '../../src/domain/types.js';

// A fresh table per test file, named in TABLE_NAME so the code under test uses it.
export async function createTestTable(): Promise<{ name: string; drop: () => Promise<void> }> {
  const name = `test-${randomUUID()}`;
  await dynamoClient().send(new CreateTableCommand(tableDefinition(name)));
  process.env.TABLE_NAME = name;
  return { name, drop: async () => void (await dynamoClient().send(new DeleteTableCommand({ TableName: name }))) };
}


const created = '2026-01-01T00:00:00.000Z';

// 0.009 degrees of latitude is about 1 km, so `km` places the shop that far north of the centre.
export function merchantAt(merchantId: string, centre: { lat: number; lng: number }, km: number): MerchantProfile {
  return {
    merchantId, name: `Shop ${merchantId}`, shopType: 'cafe', street: '1 Main St', suburb: 'Melbourne', state: 'VIC',
    postcode: '3000', lat: centre.lat + 0.009 * km, lng: centre.lng, geohash: 'r1r0fsnzv', createdAt: created,
  };
}

export function testOffer(merchantId: string, offerId: string, patch: Partial<Offer> = {}): Offer {
  return {
    offerId, merchantId, productName: `Product ${offerId}`, categoryId: 'coffee', percentOff: 15, originalPriceCents: 450,
    active: true, createdAt: created, updatedAt: created, ...patch,
  };
}

export async function putItems(profiles: MerchantProfile[], offers: Offer[]) {
  for (const Item of [...profiles.map(merchantProfileItem), ...offers.map(offerItem)]) {
    await dynamoClient().send(new PutCommand({ TableName: tableName(), Item }));
  }
}
