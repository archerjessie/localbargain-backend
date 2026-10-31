import type { CreateTableCommandInput } from '@aws-sdk/client-dynamodb';

// The same table as `Table` in template.yaml (design D5). Used by the seed script and integration tests.
// test/unit/table.test.ts keeps the two in step.
export function tableDefinition(TableName: string): CreateTableCommandInput {
  const key = (prefix: string) => [
    { AttributeName: `${prefix}PK`, KeyType: 'HASH' as const },
    { AttributeName: `${prefix}SK`, KeyType: 'RANGE' as const },
  ];
  return {
    TableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK'].map((AttributeName) => ({
      AttributeName,
      AttributeType: 'S' as const,
    })),
    KeySchema: key(''),
    GlobalSecondaryIndexes: ['GSI1', 'GSI2'].map((IndexName) => ({
      IndexName,
      KeySchema: key(IndexName),
      Projection: { ProjectionType: 'ALL' as const },
    })),
  };
}
