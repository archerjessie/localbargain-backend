import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dynamoClient, tableName } from '../../src/data/clients.js';
import { redemptionItem } from '../../src/data/items.js';
import type { Redemption } from '../../src/domain/types.js';
import { handler } from '../../src/handlers/consumer.js';
import { apiEvent } from '../support/events.js';
import { createTestTable } from './helpers.js';

// Cognito is the only stubbed boundary. The log records each call and what the table held at that moment.
const log: { call: 'disable' | 'delete'; sub: string; linkedRedemptions: number }[] = [];
const record = (call: 'disable' | 'delete') => async (sub: string) => {
  log.push({ call, sub, linkedRedemptions: (await historyFor(sub)).length });
};
vi.mock('../../src/identity/identity.js', async (original) => ({
  ...(await original<typeof import('../../src/identity/identity.js')>()),
  identity: () => ({ disableConsumer: record('disable'), deleteConsumer: record('delete') }),
}));

let seq = 0;
async function seedRedemption(userId: string, displayName: string): Promise<string> {
  const redemptionId = `r${++seq}`;
  const r: Redemption = {
    redemptionId, redeemedAt: `2026-11-01T10:00:${String(seq).padStart(2, '0')}.000Z`, merchantId: 'm1', merchantName: 'Bean There',
    userId, displayName, offerId: 'o1', productName: 'Flat white', categoryId: 'coffee', percentOff: 15,
    originalPriceCents: 450, discountedPriceCents: 383,
  };
  await dynamoClient().send(new PutCommand({ TableName: tableName(), Item: redemptionItem(r) }));
  return redemptionId;
}

async function historyFor(sub: string) {
  const { Items } = await dynamoClient().send(
    new QueryCommand({ TableName: tableName(), IndexName: 'GSI1', KeyConditionExpression: 'GSI1PK = :u', ExpressionAttributeValues: { ':u': `USER#${sub}` } }),
  );
  return Items ?? [];
}
async function shopEntry(redemptionId: string) {
  const { Items } = await dynamoClient().send(
    new QueryCommand({ TableName: tableName(), KeyConditionExpression: 'PK = :pk AND begins_with(SK, :r)', ExpressionAttributeValues: { ':pk': 'MERCHANT#m1', ':r': 'REDEMPTION#' } }),
  );
  return Items?.find((item) => item.redemptionId === redemptionId);
}

const deleteMe = (sub: string) => handler(apiEvent('DELETE /me', { sub }));

let drop: () => Promise<void>;
beforeAll(async () => ({ drop } = await createTestTable()));
afterAll(async () => drop?.());
beforeEach(() => void log.splice(0));

describe('DELETE /me', () => {
  it('disables the account, anonymises its redemptions, then deletes it', async () => {
    await seedRedemption('consumer-order', 'Alex');
    await seedRedemption('consumer-order', 'Alex');
    const response = await deleteMe('consumer-order');
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(log).toEqual([
      { call: 'disable', sub: 'consumer-order', linkedRedemptions: 2 },
      { call: 'delete', sub: 'consumer-order', linkedRedemptions: 0 },
    ]);
  });

  it('keeps the entries in merchant history with no userId, display name, or GSI1 keys', async () => {
    const ids = [await seedRedemption('consumer-history', 'Alex'), await seedRedemption('consumer-history', 'Alex')];
    await deleteMe('consumer-history');
    for (const id of ids) {
      const entry = await shopEntry(id);
      for (const field of ['userId', 'displayName', 'GSI1PK', 'GSI1SK']) expect(entry).not.toHaveProperty(field);
      expect(entry).toMatchObject({ productName: 'Flat white', percentOff: 15, originalPriceCents: 450, discountedPriceCents: 383 });
    }
  });

  it("leaves another consumer's redemptions and history alone", async () => {
    const other = await seedRedemption('consumer-other', 'Sam');
    await seedRedemption('consumer-leaving', 'Alex');
    await deleteMe('consumer-leaving');
    expect(await shopEntry(other)).toMatchObject({ userId: 'consumer-other', displayName: 'Sam', GSI1PK: 'USER#consumer-other' });
    expect(await historyFor('consumer-other')).toHaveLength(1);
  });

  it('succeeds when run a second time', async () => {
    await seedRedemption('consumer-twice', 'Alex');
    expect((await deleteMe('consumer-twice')).statusCode).toBe(204);
    expect((await deleteMe('consumer-twice')).statusCode).toBe(204);
    expect(log.filter((entry) => entry.call === 'delete')).toHaveLength(2);
  });

  it('answers 401 without a consumer', async () => {
    expect((await handler(apiEvent('DELETE /me'))).statusCode).toBe(401);
  });
});
