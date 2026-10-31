import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { Offer } from '../domain/types.js';
import { dynamoClient, tableName } from './clients.js';
import { offerFromItem, offerItem, offerKey } from './items.js';

// Offers live under the merchant's own partition, so a lookup with another merchant's ID simply finds nothing.
export async function getOffer(merchantId: string, offerId: string): Promise<Offer | undefined> {
  const { Item } = await dynamoClient().send(new GetCommand({ TableName: tableName(), Key: offerKey(merchantId, offerId) }));
  return Item ? offerFromItem(Item) : undefined;
}

export class OfferChangedError extends Error {}

// A full Put (not UpdateItem), so an inactive offer's GSI2 keys are removed with it (design D5).
// A replace only succeeds if the offer still has the updatedAt that was read (optimistic lock), so two
// concurrent PATCHes cannot silently undo each other, for example re-activating a deactivated offer.
export async function putOffer(offer: Offer, write: { create: true } | { expectedUpdatedAt: string }): Promise<void> {
  try {
    await dynamoClient().send(
      new PutCommand({
        TableName: tableName(),
        Item: offerItem(offer),
        ...('create' in write
          ? { ConditionExpression: 'attribute_not_exists(PK)' }
          : { ConditionExpression: 'updatedAt = :read', ExpressionAttributeValues: { ':read': write.expectedUpdatedAt } }),
      }),
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) throw new OfferChangedError(offer.offerId);
    throw error;
  }
}

export async function listOffers(merchantId: string): Promise<Offer[]> {
  const prefix = offerKey(merchantId, '');
  const offers: Offer[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await dynamoClient().send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :offer)',
        ExpressionAttributeValues: { ':pk': prefix.PK, ':offer': prefix.SK },
        ExclusiveStartKey,
      }),
    );
    offers.push(...(page.Items ?? []).map(offerFromItem));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return offers;
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
