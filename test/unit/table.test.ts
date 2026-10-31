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

describe('function build settings', () => {
  // SAM Globals cannot hold Metadata, so the four esbuild blocks are written out. This keeps them identical.
  it('are the same for every function except the entry point', () => {
    const template = parse(readFileSync(new URL('../../template.yaml', import.meta.url), 'utf8'), { logLevel: 'silent' });
    const functions = Object.entries(template.Resources as Record<string, { Type: string; Metadata?: { BuildProperties?: Record<string, unknown> } }>)
      .filter(([, r]) => r.Type === 'AWS::Serverless::Function');
    expect(functions).toHaveLength(4);
    const shared = functions.map(([, r]) => ({ ...r.Metadata?.BuildProperties, EntryPoints: undefined }));
    for (const settings of shared) expect(settings).toEqual(shared[0]);
    expect(shared[0]).toHaveProperty('Banner');
  });
});
