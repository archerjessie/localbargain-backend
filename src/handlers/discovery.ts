// Discovery Lambda: reference data and finding merchants (design D2).
import { discoveryCandidates } from '../data/merchants.js';
import { discover } from '../domain/discovery.js';
import { searchLocalities } from '../domain/localitySearch.js';
import { json } from '../domain/responses.js';
import { discoveryQuery, locationsQuery, parseRequest } from '../domain/validation.js';
import { merchantView, offerView } from '../domain/views.js';
import { getCaller } from '../identity/caller.js';
import { categories } from '../reference/categories.js';
import localities from '../reference/localities.json' with { type: 'json' };
import { router } from './router.js';

const imageBaseUrl = () => process.env.IMAGE_BASE_URL ?? '';

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

  'GET /discovery': async (event) => {
    const caller = getCaller(event, 'consumer');
    if (!caller.ok) return caller.response;
    const query = parseRequest(discoveryQuery, event.queryStringParameters ?? {});
    if (!query.ok) return query.response;
    const { profiles, offers } = await discoveryCandidates();
    const items = discover(profiles, offers, query.data, query.data.radiusMetres).map((found) => ({
      ...merchantView(found.merchant),
      offers: found.offers.map((offer) => offerView(offer, imageBaseUrl())),
      distanceMetres: found.distanceMetres,
    }));
    return json(200, { items });
  },
});
