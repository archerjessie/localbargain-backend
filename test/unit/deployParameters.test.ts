import { describe, expect, it } from 'vitest';
import { buildParameters } from '../../scripts/deploy-parameters.mjs';

const prefix = '/localbargain/dev';
const param = (name: string, Value: string, Version = 1) => ({ Name: `${prefix}/${name}`, Value, Version });
const base = [param('qr-key', 'a2V5', 3), param('budget-email', 'owner@example.com')];
const asObject = (list: { ParameterKey: string; ParameterValue: string }[]) =>
  Object.fromEntries(list.map((p) => [p.ParameterKey, p.ParameterValue]));

describe('buildParameters', () => {
  it('passes the budget email and the QR key version, and leaves empty federation values out', () => {
    expect(asObject(buildParameters(base, [], prefix))).toEqual({ BudgetEmail: 'owner@example.com', QrKeyVersion: '3', EnableSmokeTestAuth: 'false' });
  });

  it('passes a multi-line Apple private key through unchanged', () => {
    const key = '-----BEGIN PRIVATE KEY-----\nabc def\n-----END PRIVATE KEY-----';
    const apple = [param('apple-services-id', 's'), param('apple-team-id', 't'), param('apple-key-id', 'k'), param('apple-private-key', key)];
    expect(asObject(buildParameters([...base, ...apple], [], prefix)).ApplePrivateKey).toBe(key);
  });

  it('refuses to deploy without the secrets of a provider the stack already has', () => {
    expect(() => buildParameters(base, ['Google'], prefix)).toThrow(/Google sign-in/);
    expect(() => buildParameters([...base, param('google-client-secret', 'x')], ['Google'], prefix)).toThrow(/google-client-id/);
    expect(() => buildParameters(base, ['SignInWithApple'], prefix)).toThrow(/apple-private-key/);
  });

  // CloudFormation does not enforce template Rules on this SAM stack, so a half-set provider must fail here.
  it('refuses a provider that is only partly configured', () => {
    expect(() => buildParameters([...base, param('google-client-id', 'id')], [], prefix)).toThrow(/google-client-secret/);
    expect(() => buildParameters([...base, param('apple-team-id', 't')], [], prefix)).toThrow(/apple-services-id/);
  });

  it('turns on smoke-test sign-in only when asked', () => {
    expect(asObject(buildParameters(base, [], prefix, { smokeTestAuth: true })).EnableSmokeTestAuth).toBe('true');
    expect(asObject(buildParameters(base, [], prefix)).EnableSmokeTestAuth).toBe('false');
  });

  it('matches provider names exactly', () => {
    expect(() => buildParameters(base, ['GoogleWorkspace'], prefix)).not.toThrow();
  });

  it('requires the QR key and the budget email', () => {
    expect(() => buildParameters([base[1]!], [], prefix)).toThrow(/qr-key/);
    expect(() => buildParameters([base[0]!], [], prefix)).toThrow(/budget-email/);
  });
});
