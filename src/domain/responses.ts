export interface JsonResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function json(statusCode: number, body: unknown): JsonResponse {
  return { statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

export function noContent(): JsonResponse {
  return { statusCode: 204, headers: {}, body: '' };
}
