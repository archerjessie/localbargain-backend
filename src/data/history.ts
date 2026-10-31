// Redemption history pages (design D5, access patterns 3 and 4): newest first, 20 per page, base64url cursors.
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { Redemption } from '../domain/types.js';
import { dynamoClient, tableName } from './clients.js';
import { redemptionFromItem } from './items.js';

const PAGE_SIZE = 20;

export class InvalidCursorError extends Error {}

interface History {
  index?: 'GSI1';
  partitionKey: 'PK' | 'GSI1PK';
  partition: string;
  // The exact attributes of a key for this query, which is what DynamoDB returns as LastEvaluatedKey.
  keyAttributes: string[];
  keyCondition: string;
  values: Record<string, string>;
}

const encodeCursor = (key: Record<string, unknown>) => Buffer.from(JSON.stringify(key)).toString('base64url');

// A cursor is a client-supplied DynamoDB key. It must be exactly a key of this query, in the caller's own partition,
// for one of their redemptions. Anything else would reach DynamoDB as an invalid start key and come back as a 500.
function decodeCursor(cursor: string, history: History): Record<string, string> {
  let key: unknown;
  try {
    key = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError();
  }
  if (typeof key !== 'object' || key === null || Array.isArray(key)) throw new InvalidCursorError();
  const entries = Object.entries(key);
  const valid =
    entries.length === history.keyAttributes.length &&
    entries.every(([name, value]) => history.keyAttributes.includes(name) && typeof value === 'string') &&
    (key as Record<string, string>)[history.partitionKey] === history.partition &&
    (key as Record<string, string>).SK?.startsWith('REDEMPTION#');
  if (!valid) throw new InvalidCursorError();
  return key as Record<string, string>;
}

async function page(history: History, cursor: string | undefined): Promise<{ items: Redemption[]; nextCursor?: string }> {
  // One item more than a page shows whether another page exists, so a full last page carries no cursor.
  const result = await dynamoClient().send(
    new QueryCommand({
      TableName: tableName(),
      ...(history.index ? { IndexName: history.index } : {}),
      KeyConditionExpression: history.keyCondition,
      ExpressionAttributeValues: history.values,
      ScanIndexForward: false,
      Limit: PAGE_SIZE + 1,
      ...(cursor ? { ExclusiveStartKey: decodeCursor(cursor, history) } : {}),
    }),
  );
  const found = result.Items ?? [];
  const items = found.slice(0, PAGE_SIZE);
  if (found.length <= PAGE_SIZE) return { items: items.map(redemptionFromItem) };
  const last = items.at(-1)!;
  const key = Object.fromEntries(history.keyAttributes.map((name) => [name, last[name]]));
  return { items: items.map(redemptionFromItem), nextCursor: encodeCursor(key) };
}

export function consumerHistory(sub: string, cursor?: string) {
  const user = `USER#${sub}`;
  return page(
    {
      index: 'GSI1',
      partitionKey: 'GSI1PK',
      partition: user,
      keyAttributes: ['PK', 'SK', 'GSI1PK', 'GSI1SK'],
      keyCondition: 'GSI1PK = :user',
      values: { ':user': user },
    },
    cursor,
  );
}

export function shopHistory(merchantId: string, cursor?: string) {
  const pk = `MERCHANT#${merchantId}`;
  return page(
    {
      partitionKey: 'PK',
      partition: pk,
      keyAttributes: ['PK', 'SK'],
      keyCondition: 'PK = :pk AND begins_with(SK, :redemption)',
      values: { ':pk': pk, ':redemption': 'REDEMPTION#' },
    },
    cursor,
  );
}
