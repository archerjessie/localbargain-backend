export function buildParameters(
  ssmParameters: { Name: string; Value: string; Version: number }[],
  providerNames: string[],
  prefix: string,
): { ParameterKey: string; ParameterValue: string }[];
