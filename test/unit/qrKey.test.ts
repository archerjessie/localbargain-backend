import { describe, expect, it, vi } from 'vitest';
import { loadQrKey } from '../../src/data/qrKey.js';

const localKey = Buffer.alloc(32, 1).toString('base64');
const ssmKey = Buffer.alloc(32, 2).toString('base64');
const fetchFromSsm = vi.fn(async () => ssmKey);

describe('loadQrKey', () => {
  it('uses QR_KEY in local mode', async () => {
    expect(await loadQrKey({ LOCAL_AUTH: '1', AWS_SAM_LOCAL: 'true', QR_KEY: localKey }, fetchFromSsm)).toEqual(Buffer.alloc(32, 1));
  });

  it('ignores QR_KEY when deployed and reads SSM instead', async () => {
    expect(await loadQrKey({ LOCAL_AUTH: '1', QR_KEY: localKey, QR_KEY_PARAMETER: '/k' }, fetchFromSsm)).toEqual(Buffer.alloc(32, 2));
    expect(fetchFromSsm).toHaveBeenCalledWith('/k');
  });

  it('refuses a key that does not decode to 32 bytes', async () => {
    await expect(loadQrKey({ QR_KEY_PARAMETER: '/k' }, async () => 'c2hvcnQ=')).rejects.toThrow(/32 bytes/);
  });
});
