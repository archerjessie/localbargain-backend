export function buildParameters(
  ssmParameters: { Name: string; Value: string; Version: number }[],
  providerNames: string[],
  prefix: string,
  options?: { smokeTestAuth?: boolean },
): { ParameterKey: string; ParameterValue: string }[];
