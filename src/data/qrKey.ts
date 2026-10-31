import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { isLocalMode, type Env } from '../identity/localMode.js';

async function fromSsm(name: string): Promise<string> {
  const { Parameter } = await new SSMClient({}).send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  if (!Parameter?.Value) throw new Error(`SSM parameter ${name} has no value`);
  return Parameter.Value;
}

// The key is stored base64-encoded (README). QR_KEY from local/env.json is public, so only local mode may use it.
export async function loadQrKey(env: Env = process.env, fetchFromSsm = fromSsm): Promise<Buffer> {
  const encoded = isLocalMode(env) && env.QR_KEY ? env.QR_KEY : await fetchFromSsm(env.QR_KEY_PARAMETER ?? '');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('QR key must decode to 32 bytes');
  return key;
}

let cached: Promise<Buffer> | undefined;

// Read once per cold start (design D10).
export function qrKey(): Promise<Buffer> {
  // Forget a failed load, so the next request retries instead of failing until the next cold start.
  cached ??= loadQrKey().catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
