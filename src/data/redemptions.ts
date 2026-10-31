import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoClient, tableName } from './clients.js';

const UPDATES_AT_ONCE = 25;

// DELETE /me (design D5): unlink every redemption from the consumer, one paged pass over GSI1. GSI1 reads lag behind
// writes, so items already done may show up once more, but updating them again is harmless. A retry picks up leftovers.
export async function anonymiseConsumer(sub: string): Promise<void> {
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await dynamoClient().send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :user',
        ExpressionAttributeValues: { ':user': `USER#${sub}` },
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey,
      }),
    );
    const keys = page.Items ?? [];
    for (let i = 0; i < keys.length; i += UPDATES_AT_ONCE) {
      await Promise.all(keys.slice(i, i + UPDATES_AT_ONCE).map(({ PK, SK }) => unlink(PK, SK)));
    }
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

async function unlink(PK: unknown, SK: unknown) {
  try {
    await dynamoClient().send(
      new UpdateCommand({
        TableName: tableName(),
        Key: { PK, SK },
        UpdateExpression: 'REMOVE userId, displayName, GSI1PK, GSI1SK',
        // A stale index hit for a removed item must not create an item with only PK and SK.
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );
  } catch (error) {
    if (!(error instanceof ConditionalCheckFailedException)) throw error;
  }
}
