import sharp from 'sharp';
import jsQR from 'jsqr';
import { QrService } from './qr.service';

/**
 * The QR code is only useful if a real scanner can read it.
 *
 * These tests do not assert on the generator's options; they decode the emitted
 * PNG back to pixels and run a real QR decoder over them, exactly as a phone
 * camera would. A change to the module size, the colour contrast or the margin
 * that made the code unreadable would fail here even though the data URI still
 * "looked" like a PNG.
 */
async function decodeDataUri(dataUri: string): Promise<string | null> {
  const base64 = dataUri.replace(/^data:image\/png;base64,/, '');
  const { data, info } = await sharp(Buffer.from(base64, 'base64'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return result?.data ?? null;
}

describe('QrService.dataUri (decoded by a real scanner)', () => {
  const service = new QrService();

  it('encodes the verification URL so a scanner reads it back exactly', async () => {
    const url = 'https://admin.oryxbhr.com/verify/abcDEF123_-xyz';
    const dataUri = await service.dataUri(url);
    expect(await decodeDataUri(dataUri)).toBe(url);
  });

  it('round-trips the URL built from a freshly issued token', async () => {
    process.env.DOCUMENT_VERIFY_BASE_URL = 'https://oryxbhr.com';
    try {
      const token = service.newToken();
      const url = service.verificationUrl(token);
      const dataUri = await service.dataUri(url);
      const decoded = await decodeDataUri(dataUri);
      expect(decoded).toBe(url);
      expect(decoded).toContain(token);
    } finally {
      delete process.env.DOCUMENT_VERIFY_BASE_URL;
    }
  });
});
