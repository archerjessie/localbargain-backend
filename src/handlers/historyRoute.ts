// GET /me/redemptions and GET /merchant/redemptions differ only in whose history they read and how it is shown.
import { InvalidCursorError } from '../data/history.js';
import { errorResponse } from '../domain/errors.js';
import { json } from '../domain/responses.js';
import type { Redemption } from '../domain/types.js';
import { cursorQuery, parseRequest } from '../domain/validation.js';
import { getCaller } from '../identity/caller.js';
import type { Pool } from '../identity/fixture.js';
import type { Route } from './router.js';

export function historyRoute(
  pool: Pool,
  read: (sub: string, cursor?: string) => Promise<{ items: Redemption[]; nextCursor?: string }>,
  view: (redemption: Redemption) => object,
): Route {
  return async (event) => {
    const caller = getCaller(event, pool);
    if (!caller.ok) return caller.response;
    const query = parseRequest(cursorQuery, event.queryStringParameters ?? {});
    if (!query.ok) return query.response;
    try {
      const { items, nextCursor } = await read(caller.caller.sub, query.data.cursor);
      return json(200, { items: items.map(view), ...(nextCursor ? { nextCursor } : {}) });
    } catch (error) {
      if (error instanceof InvalidCursorError) return errorResponse(400, 'validation_error', 'cursor is not a valid cursor for this history');
      throw error;
    }
  };
}
