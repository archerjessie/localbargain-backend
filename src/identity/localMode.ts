export type Env = Record<string, string | undefined>;

// Design D9: local mode needs both flags. A deployed stack never has AWS_SAM_LOCAL, so it can't switch on there.
export function isLocalMode(env: Env = process.env): boolean {
  return env.LOCAL_AUTH === '1' && env.AWS_SAM_LOCAL === 'true';
}
