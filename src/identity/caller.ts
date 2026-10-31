import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { json, type JsonResponse } from '../domain/responses.js';
import { findFixtureUser, type Pool } from './fixture.js';
import { isLocalMode, type Env } from './localMode.js';

export interface Caller {
  sub: string;
  email: string;
  displayName?: string;
}

export type CallerResult = { ok: true; caller: Caller } | { ok: false; response: JsonResponse };

// Same body API Gateway's JWT authorizer sends, so clients see one 401 shape locally and deployed.
const unauthorized: CallerResult = { ok: false, response: json(401, { message: 'Unauthorized' }) };

export function getCaller(event: APIGatewayProxyEventV2WithJWTAuthorizer, pool: Pool, env: Env = process.env): CallerResult {
  if (isLocalMode(env)) {
    const user = findFixtureUser(event.headers?.['x-debug-sub'] ?? '', pool);
    return user ? { ok: true, caller: { sub: user.sub, email: user.email, displayName: user.displayName } } : unauthorized;
  }
  // The authorizer already checked the signature, issuer, and audience, so the pool is right (design D3).
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  // Only ID tokens carry email and given_name (openapi.yaml asks for the ID token).
  if (!claims || claims.token_use !== 'id' || typeof claims.sub !== 'string' || typeof claims.email !== 'string') {
    return unauthorized;
  }
  const displayName = typeof claims.given_name === 'string' ? claims.given_name : undefined;
  return { ok: true, caller: { sub: claims.sub, email: claims.email, ...(displayName ? { displayName } : {}) } };
}
