import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

// A minimal HTTP API event as the routed handlers see it, with the caller given as ID token claims.
export function apiEvent(
  routeKey: string,
  opts: {
    sub?: string;
    email?: string;
    givenName?: string;
    query?: Record<string, string>;
    path?: Record<string, string>;
    body?: unknown;
  } = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  const claims = opts.sub
    ? { sub: opts.sub, email: opts.email ?? `${opts.sub}@example.com`, token_use: 'id', ...(opts.givenName ? { given_name: opts.givenName } : {}) }
    : undefined;
  return {
    routeKey,
    headers: {},
    queryStringParameters: opts.query,
    pathParameters: opts.path,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    isBase64Encoded: false,
    requestContext: claims ? { authorizer: { jwt: { claims, scopes: null } } } : {},
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

export const bodyOf = (response: { body: string }) => JSON.parse(response.body);
