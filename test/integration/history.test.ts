import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dynamoClient, tableName } from '../../src/data/clients.js';
import { redemptionItem } from '../../src/data/items.js';
import type { Redemption } from '../../src/domain/types.js';
import { handler as consumer } from '../../src/handlers/consumer.js';
import { handler as merchant } from '../../src/handlers/merchant.js';
import { expectContract } from '../support/contract.js';
import { apiEvent, bodyOf } from '../support/events.js';
import { createTestTable } from './helpers.js';

const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 9, minute)).toISOString();
const redemption = (n: number, userId: string, merchantId: string): Redemption => ({
  redemptionId: `${userId}-${n}`, redeemedAt: at(n), merchantId, merchantName: `Shop ${merchantId}`, userId,
  displayName: userId === 'consumer-a' ? 'Alex' : 'Sam', offerId: 'o1', productName: 'Flat white', categoryId: 'coffee',
  percentOff: 15, originalPriceCents: 450, discountedPriceCents: 383,
});
const cursorOf = (key: unknown) => Buffer.from(JSON.stringify(key)).toString('base64url');

const myHistory = (sub: string, cursor?: string) =>
  consumer(apiEvent('GET /me/redemptions', { sub, ...(cursor ? { query: { cursor } } : {}) }));
const shopHistory = (sub: string, cursor?: string) =>
  merchant(apiEvent('GET /merchant/redemptions', { sub, ...(cursor ? { query: { cursor } } : {}) }));

let drop: () => Promise<void>;
beforeAll(async () => {
  ({ drop } = await createTestTable());
  const items = [
    ...Array.from({ length: 24 }, (_, i) => redemption(i, 'consumer-a', 'shop-1')),
    ...Array.from({ length: 3 }, (_, i) => redemption(30 + i, 'consumer-b', 'shop-1')),
    redemption(40, 'consumer-a', 'shop-2'),
    ...Array.from({ length: 20 }, (_, i) => redemption(i, 'consumer-twenty', 'shop-3')),
  ];
  // The newest shop-1 item also stores an email, to prove the merchant view never passes it on.
  await Promise.all(
    items.map((r) =>
      dynamoClient().send(
        new PutCommand({ TableName: tableName(), Item: { ...redemptionItem(r), ...(r.redemptionId === 'consumer-b-32' ? { email: 'sam@example.com' } : {}) } }),
      ),
    ),
  );
});
afterAll(async () => drop?.());

describe('GET /me/redemptions', () => {
  it("pages the consumer's 25 redemptions as 20 then 5, newest first, with no other consumer's", async () => {
    const first = bodyOf(await myHistory('consumer-a'));
    expectContract('GET', '/me/redemptions', 200, first);
    expect(first.items).toHaveLength(20);
    expect(first.items[0]).toMatchObject({ redemptionId: 'consumer-a-40', merchantName: 'Shop shop-2' });
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = bodyOf(await myHistory('consumer-a', first.nextCursor));
    expectContract('GET', '/me/redemptions', 200, second);
    expect(second.items).toHaveLength(5);
    expect(second).not.toHaveProperty('nextCursor');

    const all = [...first.items, ...second.items];
    const times = all.map((r: { redeemedAt: string }) => r.redeemedAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(all.every((r: { redemptionId: string }) => r.redemptionId.startsWith('consumer-a-'))).toBe(true);
  });

  it("never shows consumer B any of consumer A's redemptions", async () => {
    const body = bodyOf(await myHistory('consumer-b'));
    expect(body.items.map((r: { redemptionId: string }) => r.redemptionId)).toEqual(['consumer-b-32', 'consumer-b-31', 'consumer-b-30']);
  });

  it('gives no nextCursor when the history is exactly one full page', async () => {
    const body = bodyOf(await myHistory('consumer-twenty'));
    expect(body.items).toHaveLength(20);
    expect(body).not.toHaveProperty('nextCursor');
  });

  it("answers 400 to a malformed cursor, a wrongly shaped one in the caller's own partition, and another consumer's", async () => {
    const theirs = bodyOf(await myHistory('consumer-a')).nextCursor;
    for (const cursor of [
      'not-a-cursor',
      theirs,
      cursorOf({ GSI1PK: 'USER#consumer-b' }),
      cursorOf({ GSI1PK: 'USER#consumer-b', GSI1SK: 5, PK: 'MERCHANT#shop-1', SK: 'REDEMPTION#x' }),
      cursorOf({ GSI1PK: 'USER#consumer-b', GSI1SK: 'x', PK: 'MERCHANT#shop-1', SK: 'PROFILE' }),
    ]) {
      const response = await myHistory('consumer-b', cursor);
      expect(response.statusCode).toBe(400);
      expectContract('GET', '/me/redemptions', 400, bodyOf(response));
    }
  });
});

describe('GET /merchant/redemptions', () => {
  it("pages the shop's 27 redemptions as 20 then 7, newest first, with display names and no consumer email or ID", async () => {
    const first = bodyOf(await shopHistory('shop-1'));
    expectContract('GET', '/merchant/redemptions', 200, first);
    expect(first.items).toHaveLength(20);
    expect(first.items[0]).toMatchObject({ redemptionId: 'consumer-b-32', displayName: 'Sam' });
    for (const item of first.items) {
      expect(item).not.toHaveProperty('userId');
      expect(item).not.toHaveProperty('email');
    }
    const second = bodyOf(await shopHistory('shop-1', first.nextCursor));
    expect(second.items).toHaveLength(7);
    expect(second).not.toHaveProperty('nextCursor');
    expect([...first.items, ...second.items].every((r: { merchantId: string }) => r.merchantId === 'shop-1')).toBe(true);
  });

  it("answers 400 to another shop's cursor and to a non-redemption key in its own partition", async () => {
    const theirs = bodyOf(await shopHistory('shop-1')).nextCursor;
    for (const cursor of [theirs, cursorOf({ PK: 'MERCHANT#shop-2', SK: 'PROFILE' }), cursorOf({ PK: 'MERCHANT#shop-2' })]) {
      const response = await shopHistory('shop-2', cursor);
      expect(response.statusCode).toBe(400);
      expectContract('GET', '/merchant/redemptions', 400, bodyOf(response));
    }
  });
});
