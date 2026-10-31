import { CreateTableCommand, DeleteTableCommand } from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'node:crypto';
import { dynamoClient } from '../../src/data/clients.js';
import { tableDefinition } from '../../src/data/table.js';

// A fresh table per test file, named in TABLE_NAME so the code under test uses it.
export async function createTestTable(): Promise<{ name: string; drop: () => Promise<void> }> {
  const name = `test-${randomUUID()}`;
  await dynamoClient().send(new CreateTableCommand(tableDefinition(name)));
  process.env.TABLE_NAME = name;
  return { name, drop: async () => void (await dynamoClient().send(new DeleteTableCommand({ TableName: name }))) };
}
