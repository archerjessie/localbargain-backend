import { QueryCommand, type QueryCommandOutput } from '@aws-sdk/lib-dynamodb';
import type { MerchantProfile, Offer } from '../domain/types.js';
import { dynamoClient, tableName } from './clients.js';
import { offerFromItem, profileFromItem } from './items.js';

async function queryAll(input: ConstructorParameters<typeof QueryCommand>[0]) {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: QueryCommandOutput['LastEvaluatedKey'];
  do {
    const page = await dynamoClient().send(new QueryCommand({ ...input, ExclusiveStartKey }));
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function split(items: Record<string, unknown>[]) {
  return {
    profiles: items.filter((i) => i.SK === 'PROFILE').map(profileFromItem),
    offers: items.filter((i) => String(i.SK).startsWith('OFFER#')).map(offerFromItem),
  };
}

// shortcut: whole-partition read, fine to ~1k merchants; move to geohash keys beyond that (profiles already store geohash)
export async function discoveryCandidates(): Promise<{ profiles: MerchantProfile[]; offers: Offer[] }> {
  return split(
    await queryAll({
      TableName: tableName(),
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :discovery',
      ExpressionAttributeValues: { ':discovery': 'DISCOVERY' },
    }),
  );
}
