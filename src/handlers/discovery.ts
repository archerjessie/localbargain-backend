// Discovery Lambda: reference data and finding merchants (design D2).
import { searchLocalities } from '../domain/localitySearch.js';
import { json } from '../domain/responses.js';
import { locationsQuery, parseRequest } from '../domain/validation.js';
import { getCaller } from '../identity/caller.js';
import { categories } from '../reference/categories.js';
import localities from '../reference/localities.json' with { type: 'json' };
import { router } from './router.js';

export const handler = router({
  'GET /categories': async () => json(200, { items: categories }),

  'GET /locations': async (event) => {
    const caller = getCaller(event, 'consumer');
    if (!caller.ok) return caller.response;
    const query = parseRequest(locationsQuery, event.queryStringParameters ?? {});
    if (!query.ok) return query.response;
    // locationsQuery already enforces the minimum length, so the search cannot return null here.
    return json(200, { items: searchLocalities(query.data.q, localities) ?? [] });
  },
});
