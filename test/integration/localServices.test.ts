import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dynamoClient, s3Client, tableName } from '../../src/data/clients.js';
import { createTestTable } from './helpers.js';

let drop: () => Promise<void>;
beforeAll(async () => ({ drop } = await createTestTable()));
afterAll(async () => drop());

describe('DynamoDB Local', () => {
  it('stores items and serves the sparse GSI2 discovery index', async () => {
    const db = dynamoClient();
    await db.send(new PutCommand({ TableName: tableName(), Item: { PK: 'MERCHANT#m1', SK: 'PROFILE', GSI2PK: 'DISCOVERY', GSI2SK: 'MERCHANT#m1#PROFILE', name: 'Bean There' } }));
    await db.send(new PutCommand({ TableName: tableName(), Item: { PK: 'MERCHANT#m1', SK: 'OFFER#o1', active: false } }));
    const { Item } = await db.send(new GetCommand({ TableName: tableName(), Key: { PK: 'MERCHANT#m1', SK: 'PROFILE' } }));
    expect(Item?.name).toBe('Bean There');
    const { Items } = await db.send(
      new QueryCommand({ TableName: tableName(), IndexName: 'GSI2', KeyConditionExpression: 'GSI2PK = :d', ExpressionAttributeValues: { ':d': 'DISCOVERY' } }),
    );
    expect(Items?.map((i) => i.SK)).toEqual(['PROFILE']);
  });
});

describe('MinIO image bucket', () => {
  const key = `offers/m1/o1/${randomUUID()}.png`;
  afterAll(async () => void (await s3Client().send(new DeleteObjectCommand({ Bucket: 'localbargain-images', Key: key }))));

  it('serves uploaded objects anonymously through IMAGE_BASE_URL', async () => {
    const body = Buffer.from('not really a png');
    await s3Client().send(new PutObjectCommand({ Bucket: 'localbargain-images', Key: key, Body: body, ContentType: 'image/png' }));
    const response = await fetch(`${process.env.IMAGE_BASE_URL}${key}`);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(body);
  });

  it('refuses anonymous writes', async () => {
    const response = await fetch(`${process.env.IMAGE_BASE_URL}offers/m1/o1/anon.png`, { method: 'PUT', body: 'x' });
    expect(response.status).toBe(403);
  });
});
