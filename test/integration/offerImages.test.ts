import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handler } from '../../src/handlers/merchant.js';
import { expectContract } from '../support/contract.js';
import { apiEvent, bodyOf } from '../support/events.js';
import { createTestTable, merchantAt, putItems, testOffer } from './helpers.js';

const merchantA = { sub: 'merchant-a' };
const imageUrlFor = (key: string) => `${process.env.IMAGE_BASE_URL}${key}`;

const requestUpload = (offerId: string, contentType: string, caller = merchantA) =>
  handler(apiEvent('POST /merchant/offers/{offerId}/image', { ...caller, path: { offerId }, body: { contentType } }));
const patch = (offerId: string, body: unknown, caller = merchantA) =>
  handler(apiEvent('PATCH /merchant/offers/{offerId}', { ...caller, path: { offerId }, body }));

// What the merchant app does with the presigned POST: every field, then the file last.
async function upload(grant: { upload: { url: string; fields: Record<string, string> } }, bytes: number, type = 'image/jpeg') {
  const form = new FormData();
  for (const [name, value] of Object.entries(grant.upload.fields)) form.append(name, value);
  form.append('file', new Blob([new Uint8Array(bytes).fill(7)], { type }));
  return fetch(grant.upload.url, { method: 'POST', body: form });
}

async function uploadedImage(offerId: string, bytes = 500 * 1024) {
  const grant = bodyOf(await requestUpload(offerId, 'image/jpeg'));
  const response = await upload(grant, bytes);
  expect(response.status).toBeLessThan(300);
  return grant.imageKey as string;
}

const served = async (key: string) => (await fetch(imageUrlFor(key))).status === 200;

let drop: () => Promise<void>;
beforeAll(async () => {
  ({ drop } = await createTestTable());
  await putItems(
    [merchantAt('merchant-a', { lat: -37.8136, lng: 144.9631 }, 0), merchantAt('merchant-b', { lat: -37.8136, lng: 144.9631 }, 1)],
    ['o1', 'o2', 'o3', 'o4', 'o5', 'o6'].map((id) => testOffer('merchant-a', id)).concat(testOffer('merchant-b', 'b1')),
  );
});
afterAll(async () => drop?.());

describe('POST /merchant/offers/{offerId}/image', () => {
  it('returns a presigned upload for a key under this merchant and offer', async () => {
    const response = await requestUpload('o1', 'image/png');
    expect(response.statusCode).toBe(201);
    const body = bodyOf(response);
    expectContract('POST', '/merchant/offers/{offerId}/image', 201, body);
    expect(body.imageKey).toMatch(/^offers\/merchant-a\/o1\/[0-9a-f-]+\.png$/);
    expect(body.upload.fields['Content-Type']).toBe('image/png');
    const expiresIn = Date.parse(body.expiresAt) - Date.now();
    expect(expiresIn).toBeGreaterThan(4 * 60_000);
    expect(expiresIn).toBeLessThanOrEqual(5 * 60_000);
  });

  it('answers image/gif with 400', async () => {
    const response = await requestUpload('o1', 'image/gif');
    expect(response.statusCode).toBe(400);
    expectContract('POST', '/merchant/offers/{offerId}/image', 400, bodyOf(response));
  });

  it("answers 404 for another merchant's offer", async () => {
    expect((await requestUpload('b1', 'image/jpeg')).statusCode).toBe(404);
  });
});

describe('attaching an image with PATCH imageKey', () => {
  it('uploads a 500 KB JPEG, attaches it, and serves it at imageUrl', async () => {
    const key = await uploadedImage('o1');
    const response = await patch('o1', { imageKey: key });
    expect(response.statusCode).toBe(200);
    expectContract('PATCH', '/merchant/offers/{offerId}', 200, bodyOf(response));
    expect(bodyOf(response).imageUrl).toBe(imageUrlFor(key));
    const image = await fetch(bodyOf(response).imageUrl);
    expect(image.status).toBe(200);
    expect((await image.arrayBuffer()).byteLength).toBe(500 * 1024);
  });

  it('has storage reject a 3 MB upload, and the offer keeps its previous image', async () => {
    const previous = await uploadedImage('o2');
    await patch('o2', { imageKey: previous });
    const grant = bodyOf(await requestUpload('o2', 'image/jpeg'));
    const response = await upload(grant, 3 * 1024 * 1024);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await served(grant.imageKey)).toBe(false);
    expect((await patch('o2', { imageKey: grant.imageKey })).statusCode).toBe(400);
    expect(bodyOf(await patch('o2', { percentOff: 16 })).imageUrl).toBe(imageUrlFor(previous));
  });

  it('refuses a content type other than the one granted', async () => {
    const grant = bodyOf(await requestUpload('o3', 'image/png'));
    const form = new FormData();
    for (const [name, value] of Object.entries(grant.upload.fields as Record<string, string>)) {
      form.append(name, name === 'Content-Type' ? 'text/html' : value);
    }
    form.append('file', new Blob(['<script>'], { type: 'text/html' }));
    expect((await fetch(grant.upload.url, { method: 'POST', body: form })).status).toBeGreaterThanOrEqual(400);
  });

  it("answers 400 for another merchant's or offer's key and for a missing upload, and changes nothing", async () => {
    const otherOffer = await uploadedImage('o4');
    for (const imageKey of [otherOffer, 'offers/merchant-b/b1/x.jpg', 'offers/merchant-a/o3/never-uploaded.jpg']) {
      const response = await patch('o3', { imageKey });
      expect(response.statusCode).toBe(400);
      expectContract('PATCH', '/merchant/offers/{offerId}', 400, bodyOf(response));
    }
    expect(bodyOf(await patch('o3', { percentOff: 16 })).imageUrl).toBeNull();
  });

  it('deletes the previous object when the image is replaced', async () => {
    const first = await uploadedImage('o5');
    await patch('o5', { imageKey: first });
    const second = await uploadedImage('o5');
    expect(bodyOf(await patch('o5', { imageKey: second })).imageUrl).toBe(imageUrlFor(second));
    expect(await served(first)).toBe(false);
    expect(await served(second)).toBe(true);
  });

  it('deletes the object when imageKey is set to null, and when the offer is deleted', async () => {
    const first = await uploadedImage('o6');
    await patch('o6', { imageKey: first });
    expect(bodyOf(await patch('o6', { imageKey: null })).imageUrl).toBeNull();
    expect(await served(first)).toBe(false);

    const second = await uploadedImage('o6');
    await patch('o6', { imageKey: second });
    expect((await handler(apiEvent('DELETE /merchant/offers/{offerId}', { ...merchantA, path: { offerId: 'o6' } }))).statusCode).toBe(204);
    expect(await served(second)).toBe(false);
  });
});
