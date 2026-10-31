import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Offer } from '../domain/types.js';
import { dynamoClient, tableName } from './clients.js';
import { offerFromItem, offerItem, offerKey } from './items.js';

// Offers live under the merchant's own partition, so a lookup with another merchant's ID simply finds nothing.
export async function getOffer(merchantId: string, offerId: string): Promise<Offer | undefined> {
  const { Item } = await dynamoClient().send(new GetCommand({ TableName: tableName(), Key: offerKey(merchantId, offerId) }));
  return Item ? offerFromItem(Item) : undefined;
}

// A full Put (not UpdateItem), so an inactive offer's GSI2 keys are removed with it (design D5).
export async function putOffer(offer: Offer, mode: 'create' | 'replace'): Promise<void> {
  await dynamoClient().send(
    new PutCommand({
      TableName: tableName(),
      Item: offerItem(offer),
      ConditionExpression: mode === 'create' ? 'attribute_not_exists(PK)' : 'attribute_exists(PK)',
    }),
  );
}

// Returns the deleted offer, or undefined when there was none.
export async function deleteOffer(merchantId: string, offerId: string): Promise<Offer | undefined> {
  try {
    const { Attributes } = await dynamoClient().send(
      new DeleteCommand({
        TableName: tableName(),
        Key: offerKey(merchantId, offerId),
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_OLD',
      }),
    );
    return Attributes ? offerFromItem(Attributes) : undefined;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return undefined;
    throw error;
  }
}
