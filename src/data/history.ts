// Redemption history pages (design D5, access patterns 3 and 4): newest first, 20 per page, base64url cursors.
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { Redemption } from '../domain/types.js';
import { dynamoClient, tableName } from './clients.js';
import { redemptionFromItem } from './items.js';

const PAGE_SIZE = 20;

export class InvalidCursorError extends Error {}

const encodeCursor = (key: Record<string, unknown>) => Buffer.from(JSON.stringify(key)).toString('base64url');

// A cursor is a client-supplied DynamoDB key, so it must point into the caller's own partition.
function decodeCursor(cursor: string, partition: { name: 'PK' | 'GSI1PK'; value: string }): Record<string, unknown> {
  let key: unknown;
  try {
    key = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError();
  }
  if (typeof key !== 'object' || key === null || (key as Record<string, unknown>)[partition.name] !== partition.value) {
    throw new InvalidCursorError();
  }
  return key as Record<string, unknown>;
}

async function page(
  query: { IndexName?: string; KeyConditionExpression: string; ExpressionAttributeValues: Record<string, string> },
  partition: { name: 'PK' | 'GSI1PK'; value: string },
  cursor: string | undefined,
): Promise<{ items: Redemption[]; nextCursor?: string }> {
  const result = await dynamoClient().send(
    new QueryCommand({
      TableName: tableName(),
      ...query,
      ScanIndexForward: false,
      Limit: PAGE_SIZE,
      ...(cursor ? { ExclusiveStartKey: decodeCursor(cursor, partition) } : {}),
    }),
  );
  const items = (result.Items ?? []).map(redemptionFromItem);
  return result.LastEvaluatedKey ? { items, nextCursor: encodeCursor(result.LastEvaluatedKey) } : { items };
}

export function consumerHistory(sub: string, cursor?: string) {
  const user = `USER#${sub}`;
  return page(
    { IndexName: 'GSI1', KeyConditionExpression: 'GSI1PK = :user', ExpressionAttributeValues: { ':user': user } },
    { name: 'GSI1PK', value: user },
    cursor,
  );
}

export function shopHistory(merchantId: string, cursor?: string) {
  const pk = `MERCHANT#${merchantId}`;
  return page(
    { KeyConditionExpression: 'PK = :pk AND begins_with(SK, :redemption)', ExpressionAttributeValues: { ':pk': pk, ':redemption': 'REDEMPTION#' } },
    { name: 'PK', value: pk },
    cursor,
  );
}
