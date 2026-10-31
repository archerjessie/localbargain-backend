import { z } from 'zod';
import users from '../../local/users.json' with { type: 'json' };

export type Pool = 'consumer' | 'merchant';

export interface FixtureUser {
  sub: string;
  email: string;
  displayName: string;
  pool: Pool;
}

// Parsed, so a typo in local/users.json fails loudly at start-up, not as a puzzling 401.
export const fixtureUsers: FixtureUser[] = z
  .array(z.strictObject({ sub: z.string().regex(/^[^.|]+$/), email: z.email(), displayName: z.string().min(1), pool: z.enum(['consumer', 'merchant']) }))
  .parse(users);

export function findFixtureUser(sub: string, pool: Pool): FixtureUser | undefined {
  return fixtureUsers.find((user) => user.sub === sub && user.pool === pool);
}
