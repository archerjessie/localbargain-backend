// Mirrors the `Error.code` enum in openapi.yaml.
export type ErrorCode =
  | 'validation_error'
  | 'invalid_qr'
  | 'not_found'
  | 'consumer_not_found'
  | 'conflict'
  | 'offer_unavailable'
  | 'internal_error';

export interface JsonResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function json(statusCode: number, body: unknown): JsonResponse {
  return { statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

export function errorResponse(statusCode: number, code: ErrorCode, message: string): JsonResponse {
  return json(statusCode, { code, message });
}
