// Checks handler responses against the schemas in openapi.yaml (design D7), so zod and the contract cannot drift apart.
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { parse } from 'yaml';

const openapi = parse(readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats.default(ajv);
ajv.addSchema({ $id: 'openapi', components: openapi.components });

type Operation = { responses: Record<string, { content?: { 'application/json'?: { schema: unknown } }; $ref?: string }> };

const validators = new Map<string, ReturnType<typeof ajv.compile>>();

function validatorFor(key: string, schema: unknown) {
  let validate = validators.get(key);
  if (!validate) {
    validate = ajv.compile(JSON.parse(JSON.stringify(schema).replaceAll('"#/components/', '"openapi#/components/')));
    validators.set(key, validate);
  }
  return validate;
}

// Validates `body` against the response schema of one operation and status code, as written in openapi.yaml.
export function expectContract(method: string, path: string, status: number, body: unknown) {
  const operation = openapi.paths[path]?.[method.toLowerCase()] as Operation | undefined;
  if (!operation) throw new Error(`openapi.yaml has no ${method} ${path}`);
  let response = operation.responses[String(status)];
  if (response?.$ref) response = openapi.components.responses[response.$ref.split('/').pop()!];
  const schema = response?.content?.['application/json']?.schema;
  if (!schema) throw new Error(`openapi.yaml has no JSON body for ${method} ${path} ${status}`);
  const validate = validatorFor(`${method} ${path} ${status}`, schema);
  const valid = validate(body);
  expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
}
