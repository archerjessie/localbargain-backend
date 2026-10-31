import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { dynamoClient, tableName } from '../../src/data/clients.js';
import { redemptionItem } from '../../src/data/items.js';
import type { Redemption } from '../../src/domain/types.js';
import { handler } from '../../src/handlers/consumer.js';
import { apiEvent } from '../support/events.js';
import { createTestTable } from './helpers.js';

// Cognito is the only stubbed boundary. The spy records what the table held when the account was deleted.
const anonymisedWhenDeleted: boolean[] = [];
const deleteConsumer = vi.fn(async (sub: string) => {
  anonymisedWhenDeleted.push((await historyFor(sub)).length === 0);
});
vi.mock('../../src/identity/identity.js', async (original) => ({
  ...(await original<typeof import('../../src/identity/identity.js')>()),
  identity: () => ({ deleteConsumer }),
}));

const redemption = (redemptionId: string, userId: string, displayName: string): Redemption => ({
  redemptionId, redeemedAt: `2026-11-01T10:00:0${redemptionId.at(-1)}.000Z`, merchantId: 'm1', merchantName: 'Bean There',
  userId, displayName, offerId: 'o1', productName: 'Flat white', categoryId: 'coffee', percentOff: 15,
  originalPriceCents: 450, discountedPriceCents: 383,
});

async function historyFor(sub: string) {
  const { Items } = await dynamoClient().send(
    new QueryCommand({ TableName: tableName(), IndexName: 'GSI1', KeyConditionExpression: 'GSI1PK = :u', ExpressionAttributeValues: { ':u': `USER#${sub}` } }),
  );
  return Items ?? [];
}
async function shopHistory() {
  const { Items } = await dynamoClient().send(
    new QueryCommand({ TableName: tableName(), KeyConditionExpression: 'PK = :pk AND begins_with(SK, :r)', ExpressionAttributeValues: { ':pk': 'MERCHANT#m1', ':r': 'REDEMPTION#' } }),
  );
  return Items ?? [];
}

const deleteMe = (sub: string) => handler(apiEvent('DELETE /me', { sub }));

let drop: () => Promise<void>;
beforeAll(async () => {
  ({ drop } = await createTestTable());
  for (const r of [redemption('r1', 'consumer-a', 'Alex'), redemption('r2', 'consumer-a', 'Alex'), redemption('r3', 'consumer-b', 'Sam')]) {
    await dynamoClient().send(new PutCommand({ TableName: tableName(), Item: redemptionItem(r) }));
  }
});
afterAll(async () => drop?.());

describe('DELETE /me', () => {
  it("anonymises the consumer's redemptions first, then deletes the account", async () => {
    const response = await deleteMe('consumer-a');
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(deleteConsumer).toHaveBeenCalledWith('consumer-a');
    expect(anonymisedWhenDeleted).toEqual([true]);
  });

  it('keeps the entries in merchant history, with no userId, display name, or GSI1 keys', async () => {
    const history = await shopHistory();
    expect(history).toHaveLength(3);
    for (const id of ['r1', 'r2']) {
      const entry = history.find((h) => h.redemptionId === id)!;
      expect(entry).not.toHaveProperty('userId');
      expect(entry).not.toHaveProperty('displayName');
      expect(entry).not.toHaveProperty('GSI1PK');
      expect(entry).toMatchObject({ productName: 'Flat white', percentOff: 15, originalPriceCents: 450, discountedPriceCents: 383 });
    }
    expect(history.find((h) => h.redemptionId === 'r3')).toMatchObject({ userId: 'consumer-b', displayName: 'Sam' });
  });

  it('succeeds when run a second time', async () => {
    expect((await deleteMe('consumer-a')).statusCode).toBe(204);
    // The recorder, not mock.calls: the mock's call history is cleared between tests.
    expect(anonymisedWhenDeleted).toEqual([true, true]);
  });

  it('answers 401 without a consumer', async () => {
    expect((await handler(apiEvent('DELETE /me'))).statusCode).toBe(401);
  });
});
