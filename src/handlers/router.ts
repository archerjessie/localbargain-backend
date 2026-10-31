import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { errorResponse } from '../domain/errors.js';
import type { JsonResponse } from '../domain/responses.js';

// Generic over the event, because the admin function sits behind the IAM authorizer, not a JWT one.
export type Route<E = APIGatewayProxyEventV2WithJWTAuthorizer> = (event: E) => Promise<JsonResponse>;

// Each Lambda serves one audience and dispatches on the HTTP API routeKey, for example "GET /discovery" (design D2).
export function router<E extends { routeKey: string } = APIGatewayProxyEventV2WithJWTAuthorizer>(routes: Record<string, Route<E>>) {
  return async (event: E): Promise<JsonResponse> => {
    const route = Object.hasOwn(routes, event.routeKey) ? routes[event.routeKey] : undefined;
    if (!route) return errorResponse(404, 'not_found', `No route for ${event.routeKey}`);
    try {
      return await route(event);
    } catch (error) {
      console.error(error);
      return errorResponse(500, 'internal_error', 'Internal server error');
    }
  };
}
