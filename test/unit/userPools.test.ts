import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

interface Resource {
  Type?: string;
  Properties?: { UserPoolId?: string; WriteAttributes?: string[]; Schema?: { Name: string; Required?: boolean }[] };
}

// Short-form tags such as !Ref parse as their plain value, so `UserPoolId: !Ref MerchantUserPool` reads as the logical ID.
const resources = (parse(readFileSync(new URL('../../template.yaml', import.meta.url), 'utf8'), { logLevel: 'error' }) as {
  Resources: Record<string, Resource>;
}).Resources;

describe('Cognito app clients', () => {
  // Cognito rejects a client that cannot write a required attribute ("Invalid write attributes"), failing the deploy.
  it('can write every required attribute of their pool', () => {
    const clients = Object.entries(resources).filter(([, r]) => r.Type === 'AWS::Cognito::UserPoolClient' && r.Properties?.WriteAttributes);
    expect(clients.length).toBeGreaterThan(0);
    for (const [name, client] of clients) {
      const pool = resources[client.Properties!.UserPoolId!]!;
      const required = (pool.Properties?.Schema ?? []).filter((a) => a.Required).map((a) => a.Name);
      expect({ name, missing: required.filter((a) => !client.Properties!.WriteAttributes!.includes(a)) }).toEqual({ name, missing: [] });
    }
  });
});
