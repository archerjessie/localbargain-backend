import { json, type JsonResponse } from './responses.js';

// Mirrors the `Error.code` enum in openapi.yaml.
export type ErrorCode =
  | 'validation_error'
  | 'invalid_qr'
  | 'not_found'
  | 'consumer_not_found'
  | 'conflict'
  | 'offer_unavailable'
  | 'internal_error';

export function errorResponse(statusCode: number, code: ErrorCode, message: string): JsonResponse {
  return json(statusCode, { code, message });
}
