// Request schemas that mirror openapi.yaml (design D7). Integration tests check responses against the contract.
import { z } from 'zod';
import { categories, type CategoryId } from '../reference/categories.js';
import { shopTypes } from '../reference/shopTypes.js';
import { errorResponse } from './errors.js';
import { MIN_QUERY_LENGTH } from './localitySearch.js';
import type { JsonResponse } from './responses.js';

const categoryIds = categories.map((c) => c.categoryId) as [CategoryId, ...CategoryId[]];

// Trim first, so text that is only whitespace fails min(1).
const text = (max: number) => z.string().trim().min(1).max(max);

const productName = text(80);
const categoryId = z.enum(categoryIds);
const percentOff = z.int().min(1).max(99);
const originalPriceCents = z.int().min(1).max(1_000_000);
const description = z.string().max(200).nullable();
// Plain ID characters only in each segment, so no . or .. segments. The handler also checks the merchant and offer prefix.
const imageKey = z.string().regex(/^offers\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/);

export const offerCreate = z.strictObject({
  productName,
  categoryId,
  percentOff,
  originalPriceCents,
  description: description.optional(),
  active: z.boolean().default(true),
});

export const offerUpdate = z
  .strictObject({
    productName: productName.optional(),
    categoryId: categoryId.optional(),
    percentOff: percentOff.optional(),
    originalPriceCents: originalPriceCents.optional(),
    description: description.optional(),
    active: z.boolean().optional(),
    imageKey: imageKey.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'at least one field is required');

export const imageUploadRequest = z.strictObject({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

export const merchantCreate = z.strictObject({
  name: text(80),
  shopType: z.enum(shopTypes),
  street: text(120),
  suburb: text(60),
  state: z.enum(['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']),
  postcode: z.string().regex(/^[0-9]{4}$/),
  // Australia's bounding box.
  lat: z.number().min(-44).max(-9),
  lng: z.number().min(112).max(154),
  // Normalised so the duplicate-email check (the Cognito username) ignores case and padding.
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

export const redemptionCreate = z.strictObject({
  qrValue: z.string().min(1),
});

// Query string values arrive as strings. Accept plain decimals only: Number() would also accept '', hex, and exponents.
const numberParam = z.string().regex(/^-?\d+(\.\d+)?$/).pipe(z.coerce.number());

export const discoveryQuery = z.object({
  lat: numberParam.pipe(z.number().min(-90).max(90)),
  lng: numberParam.pipe(z.number().min(-180).max(180)),
  radiusMetres: numberParam.pipe(z.int().min(1).max(50_000)).default(5000),
});

export const locationsQuery = z.object({
  // Check the raw length against the contract before trimming.
  q: z.string().max(60).trim().min(MIN_QUERY_LENGTH),
});

export const cursorQuery = z.object({
  cursor: z.string().min(1).optional(),
});

export type ParseResult<T> = { ok: true; data: T } | { ok: false; response: JsonResponse };

export function parseRequest<S extends z.ZodType>(schema: S, input: unknown): ParseResult<z.output<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const message = result.error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ');
  return { ok: false, response: errorResponse(400, 'validation_error', message) };
}

// For request bodies: a missing, non-JSON, or base64-encoded body is handled here, so it becomes a 400, not a 500.
export function parseJsonBody<S extends z.ZodType>(
  schema: S,
  body: string | undefined,
  isBase64Encoded: boolean,
): ParseResult<z.output<S>> {
  let input: unknown;
  try {
    input = JSON.parse(isBase64Encoded && body ? Buffer.from(body, 'base64').toString('utf8') : (body ?? ''));
  } catch {
    return { ok: false, response: errorResponse(400, 'validation_error', 'Request body must be valid JSON') };
  }
  return parseRequest(schema, input);
}
