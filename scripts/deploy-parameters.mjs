// Builds the CloudFormation parameters for scripts/deploy.sh from SSM, and refuses to drop an existing sign-in provider.
// Usage: node scripts/deploy-parameters.mjs <get-parameters-by-path JSON> <list-identity-providers JSON> <prefix> <out file>
import { writeFileSync } from 'node:fs';

const groups = {
  Google: { GoogleClientId: 'google-client-id', GoogleClientSecret: 'google-client-secret' },
  SignInWithApple: {
    AppleServicesId: 'apple-services-id',
    AppleTeamId: 'apple-team-id',
    AppleKeyId: 'apple-key-id',
    ApplePrivateKey: 'apple-private-key',
  },
};

export function buildParameters(ssmParameters, providerNames, prefix) {
  const ssm = Object.fromEntries(ssmParameters.map((p) => [p.Name.slice(prefix.length + 1), p]));
  const value = (name) => ssm[name]?.Value ?? '';
  if (!ssm['qr-key']) throw new Error(`create ${prefix}/qr-key first (see README)`);
  if (!value('budget-email')) throw new Error(`create ${prefix}/budget-email first`);

  // The key's SSM version lands in an env var, so a rotation always replaces the running functions.
  const parameters = { BudgetEmail: value('budget-email'), QrKeyVersion: String(ssm['qr-key'].Version) };
  for (const [provider, names] of Object.entries(groups)) {
    const missing = Object.values(names).filter((name) => !value(name));
    // A deploy without a provider's parameters deletes it, and CloudFormation still reports success.
    if (providerNames.includes(provider) && missing.length) {
      throw new Error(
        `the stack has ${provider} sign-in, but ${missing.map((m) => `${prefix}/${m}`).join(', ')} is empty; refusing to delete the provider`,
      );
    }
    // Empty values are left out, so they take the template default ('') rather than an ambiguous empty override.
    for (const [key, name] of Object.entries(names)) if (value(name)) parameters[key] = value(name);
  }
  return Object.entries(parameters).map(([ParameterKey, ParameterValue]) => ({ ParameterKey, ParameterValue }));
}

if (process.argv[1]?.endsWith('deploy-parameters.mjs')) {
  const [ssmJson, providersJson, prefix, out] = process.argv.slice(2);
  try {
    const parameters = buildParameters(
      JSON.parse(ssmJson).Parameters,
      JSON.parse(providersJson).Providers.map((p) => p.ProviderName),
      prefix,
    );
    writeFileSync(out, JSON.stringify(parameters), { mode: 0o600 });
  } catch (error) {
    console.error(`deploy: ${error.message}`);
    process.exit(1);
  }
}
