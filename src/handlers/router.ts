import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { errorResponse } from '../domain/errors.js';
import type { JsonResponse } from '../domain/responses.js';

export type Route = (event: APIGatewayProxyEventV2) => Promise<JsonResponse>;

// Each Lambda serves one audience and dispatches on the HTTP API routeKey, for example "GET /discovery" (design D2).
export function router(routes: Record<string, Route>) {
  return async (event: APIGatewayProxyEventV2): Promise<JsonResponse> => {
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
