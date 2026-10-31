import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoClient, tableName } from './clients.js';

// DELETE /me (design D5): unlink every redemption from the consumer. Removing GSI1 keys drops each one from the
// consumer's history, so querying again from the start until nothing is left also finishes a half-done earlier run.
export async function anonymiseConsumer(sub: string): Promise<number> {
  let count = 0;
  for (;;) {
    const { Items } = await dynamoClient().send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :user',
        ExpressionAttributeValues: { ':user': `USER#${sub}` },
        ProjectionExpression: 'PK, SK',
      }),
    );
    if (!Items?.length) return count;
    for (const { PK, SK } of Items) {
      await dynamoClient().send(
        new UpdateCommand({ TableName: tableName(), Key: { PK, SK }, UpdateExpression: 'REMOVE userId, displayName, GSI1PK, GSI1SK' }),
      );
      count++;
    }
  }
}
