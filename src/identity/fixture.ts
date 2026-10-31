import users from '../../local/users.json' with { type: 'json' };

export type Pool = 'consumer' | 'merchant';

export interface FixtureUser {
  sub: string;
  email: string;
  displayName: string;
  pool: Pool;
}

export const fixtureUsers = users as FixtureUser[];

export function findFixtureUser(sub: string, pool: Pool): FixtureUser | undefined {
  return fixtureUsers.find((user) => user.sub === sub && user.pool === pool);
}
