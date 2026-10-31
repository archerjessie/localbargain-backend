import { describe, expect, it } from 'vitest';
import {
  discoveryQuery,
  imageUploadRequest,
  locationsQuery,
  merchantCreate,
  offerCreate,
  offerUpdate,
  parseJsonBody,
  parseRequest,
  redemptionCreate,
} from '../../src/domain/validation.js';

const validOffer = { productName: 'Flat white', categoryId: 'coffee', percentOff: 20, originalPriceCents: 450 };
const validMerchant = {
  name: 'Bean There', shopType: 'cafe', street: '1 Swanston St', suburb: 'Melbourne', state: 'VIC',
  postcode: '3000', lat: -37.8136, lng: 144.9631, email: 'owner@example.com',
};

function expect400(result: ReturnType<typeof parseRequest>) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.response.statusCode).toBe(400);
  expect(result.response.headers['content-type']).toBe('application/json');
  const body = JSON.parse(result.response.body);
  expect(body.code).toBe('validation_error');
  expect(typeof body.message).toBe('string');
  expect(body.message).not.toBe('');
}

describe('parseRequest', () => {
  it('returns the parsed data for a valid request', () => {
    expect(parseRequest(offerCreate, validOffer)).toEqual({ ok: true, data: { ...validOffer, active: true } });
  });

  it('names the failing field in the message', () => {
    const result = parseRequest(offerCreate, { ...validOffer, percentOff: 0 });
    expect(!result.ok && JSON.parse(result.response.body).message).toContain('percentOff');
  });
});

describe('offerCreate', () => {
  it('defaults active to true', () => {
    expect(parseRequest(offerCreate, validOffer)).toEqual({ ok: true, data: { ...validOffer, active: true } });
  });

  it('trims productName and rejects one that is only whitespace', () => {
    expect(parseRequest(offerCreate, { ...validOffer, productName: '  Flat white ' })).toMatchObject({ data: { productName: 'Flat white' } });
    expect400(parseRequest(offerCreate, { ...validOffer, productName: '   ' }));
  });

  it.each([0, 100, 1.5, '20'])('rejects percentOff %j', (percentOff) => {
    expect400(parseRequest(offerCreate, { ...validOffer, percentOff }));
  });

  it.each([0, -1, 4.5, 1_000_001, '450'])('rejects originalPriceCents %j', (originalPriceCents) => {
    expect400(parseRequest(offerCreate, { ...validOffer, originalPriceCents }));
  });

  it('rejects a missing originalPriceCents', () => {
    const withoutPrice: Partial<typeof validOffer> = { ...validOffer };
    delete withoutPrice.originalPriceCents;
    expect400(parseRequest(offerCreate, withoutPrice));
  });

  it('rejects an unknown categoryId', () => {
    expect400(parseRequest(offerCreate, { ...validOffer, categoryId: 'weapons' }));
  });

  it.each(['', 'x'.repeat(81)])('rejects productName of length %#', (productName) => {
    expect400(parseRequest(offerCreate, { ...validOffer, productName }));
  });

  it('accepts the boundaries: 1 and 99 percent, 1 and 1,000,000 cents, 80-character name, 200-character description', () => {
    for (const patch of [
      { percentOff: 1 }, { percentOff: 99 }, { originalPriceCents: 1 }, { originalPriceCents: 1_000_000 },
      { productName: 'x'.repeat(80) }, { description: 'x'.repeat(200) }, { description: null },
    ]) {
      expect(parseRequest(offerCreate, { ...validOffer, ...patch }).ok).toBe(true);
    }
  });

  it('rejects a 201-character description', () => {
    expect400(parseRequest(offerCreate, { ...validOffer, description: 'x'.repeat(201) }));
  });

  it('rejects discountedPriceCents and imageKey as input', () => {
    expect400(parseRequest(offerCreate, { ...validOffer, discountedPriceCents: 360 }));
    expect400(parseRequest(offerCreate, { ...validOffer, imageKey: 'offers/m/o/a.jpg' }));
  });
});

describe('offerUpdate', () => {
  it('accepts a partial update, a null imageKey, and a well-formed imageKey', () => {
    expect(parseRequest(offerUpdate, { percentOff: 15 }).ok).toBe(true);
    expect(parseRequest(offerUpdate, { imageKey: null }).ok).toBe(true);
    expect(parseRequest(offerUpdate, { imageKey: 'offers/m1/o1/3f2a.jpg' }).ok).toBe(true);
  });

  it.each([{}, { percentOff: 100 }, { imageKey: '' }, { imageKey: 'elsewhere/a.jpg' }, { imageKey: 'offers/../o1/a.jpg' }, { imageKey: 'offers/m1/./a.jpg' }, { active: 'yes' }])(
    'rejects %j',
    (body) => expect400(parseRequest(offerUpdate, body)),
  );
});

describe('imageUploadRequest', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (contentType) => {
    expect(parseRequest(imageUploadRequest, { contentType }).ok).toBe(true);
  });

  it('rejects image/gif', () => {
    expect400(parseRequest(imageUploadRequest, { contentType: 'image/gif' }));
  });
});

describe('merchantCreate', () => {
  it('accepts a valid merchant', () => {
    expect(parseRequest(merchantCreate, validMerchant).ok).toBe(true);
  });

  it.each([
    { lat: 51.5 }, { lat: -45 }, { lat: -8 }, { lng: 111 }, { lng: 155 }, { lng: -0.12 },
  ])('rejects coordinates outside Australia: %j', (patch) => {
    expect400(parseRequest(merchantCreate, { ...validMerchant, ...patch }));
  });

  it.each(['300', '30000', 'abcd', 3000])('rejects postcode %j', (postcode) => {
    expect400(parseRequest(merchantCreate, { ...validMerchant, postcode }));
  });

  it('trims and lowercases the email', () => {
    expect(parseRequest(merchantCreate, { ...validMerchant, email: ' Owner@Example.COM ' })).toMatchObject({ data: { email: 'owner@example.com' } });
  });

  it.each(['name', 'street', 'suburb', 'email', 'lat'])('rejects a missing %s', (field) => {
    const body: Record<string, unknown> = { ...validMerchant };
    delete body[field];
    expect400(parseRequest(merchantCreate, body));
  });

  it('rejects an unknown field and a whitespace-only name', () => {
    expect400(parseRequest(merchantCreate, { ...validMerchant, geohash: 'r1r0fsnzv' }));
    expect400(parseRequest(merchantCreate, { ...validMerchant, name: '  ' }));
  });

  it('rejects an unknown shopType and an invalid email', () => {
    expect400(parseRequest(merchantCreate, { ...validMerchant, shopType: 'casino' }));
    expect400(parseRequest(merchantCreate, { ...validMerchant, email: 'not-an-email' }));
  });
});

describe('discoveryQuery', () => {
  it('parses query strings and defaults the radius to 5000 metres', () => {
    expect(parseRequest(discoveryQuery, { lat: '-37.8136', lng: '144.9631' })).toEqual({
      ok: true, data: { lat: -37.8136, lng: 144.9631, radiusMetres: 5000 },
    });
  });

  it.each([
    { lat: '91', lng: '144' }, { lat: '-91', lng: '144' }, { lat: '-37', lng: '181' }, { lat: '-37', lng: '-181' }, { lat: '-37' },
    { lat: '0x10', lng: '144' }, { lat: '1e1', lng: '144' }, { lat: '-37', lng: '144', radiusMetres: '0x10' }, { lat: '', lng: '144' },
    { lat: 'abc', lng: '144' }, { lng: '144' }, { lat: '-37', lng: '144', radiusMetres: '50001' },
    { lat: '-37', lng: '144', radiusMetres: '0' }, { lat: '-37', lng: '144', radiusMetres: '1.5' },
  ])('rejects %j', (query) => expect400(parseRequest(discoveryQuery, query)));

  it('accepts a 50 km radius', () => {
    expect(parseRequest(discoveryQuery, { lat: '-37', lng: '144', radiusMetres: '50000' }).ok).toBe(true);
  });
});

describe('locationsQuery', () => {
  it('accepts a 2-character query', () => {
    expect(parseRequest(locationsQuery, { q: 'Ri' }).ok).toBe(true);
  });

  it.each([{}, { q: '' }, { q: 'R' }, { q: ' R ' }, { q: ' '.repeat(10) + 'x'.repeat(60) }])('rejects %j', (query) => {
    expect400(parseRequest(locationsQuery, query));
  });
});

describe('redemptionCreate', () => {
  it('accepts a non-empty qrValue', () => {
    expect(parseRequest(redemptionCreate, { qrValue: 'lb1.a.b.c' }).ok).toBe(true);
  });

  it.each([{}, { qrValue: '' }, { qrValue: 42 }])('rejects %j', (body) => {
    expect400(parseRequest(redemptionCreate, body));
  });
});

describe('parseJsonBody', () => {
  it('parses a JSON body and validates it', () => {
    expect(parseJsonBody(redemptionCreate, '{"qrValue":"lb1.a.b.c"}', false)).toEqual({ ok: true, data: { qrValue: 'lb1.a.b.c' } });
  });

  it('decodes a base64 body', () => {
    const body = Buffer.from('{"qrValue":"x"}').toString('base64');
    expect(parseJsonBody(redemptionCreate, body, true)).toEqual({ ok: true, data: { qrValue: 'x' } });
  });

  it.each([undefined, '', '{bad', 'null'])('answers body %j with 400 validation_error', (body) => {
    expect400(parseJsonBody(redemptionCreate, body, false));
  });
});
