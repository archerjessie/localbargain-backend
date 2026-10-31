import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { tableDefinition } from '../../src/data/table.js';

describe('tableDefinition', () => {
  it('matches the Table resource in template.yaml', () => {
    const template = parse(readFileSync(new URL('../../template.yaml', import.meta.url), 'utf8'), { logLevel: 'silent' });
    const { BillingMode, AttributeDefinitions, KeySchema, GlobalSecondaryIndexes } = template.Resources.Table.Properties;
    expect(tableDefinition('t')).toEqual({ TableName: 't', BillingMode, AttributeDefinitions, KeySchema, GlobalSecondaryIndexes });
  });
});
