import { inflateSync } from 'node:zlib';
import jsQR from 'jsqr';

/**
 * Reads the QR code out of a rendered PDF, the way a phone camera would.
 *
 * The verification strip draws the code as a raster image, so Chromium embeds
 * it as an image XObject rather than as vector paths. This walks the PDF for
 * those XObjects, inflates each stream and runs a real QR decoder over the
 * pixels. Asserting on the generator's options would only prove the code was
 * *asked for*; decoding the bytes out of the finished document proves the code
 * that a reader will actually see on the page is scannable.
 *
 * Returns the decoded payloads, in document order. A caller that expects one
 * code asserts on `[0]`; an empty array means the document carried no readable
 * code at all.
 */
export function decodeQrCodesInPdf(bytes: Buffer): string[] {
  const source = bytes.toString('latin1');
  const found: string[] = [];
  const imageDict = /<<([^<>]*(?:<[^>]*>[^<>]*)*)>>\s*stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = imageDict.exec(source))) {
    const dict = match[1];
    if (!/\/Image/.test(dict)) continue;

    const width = Number(/\/Width\s+(\d+)/.exec(dict)?.[1]);
    const height = Number(/\/Height\s+(\d+)/.exec(dict)?.[1]);
    const length = Number(/\/Length\s+(\d+)/.exec(dict)?.[1]);
    if (!width || !height || !length) continue;

    const raw = Buffer.from(source.slice(imageDict.lastIndex, imageDict.lastIndex + length), 'latin1');
    let pixels: Buffer;
    try {
      pixels = /\/FlateDecode/.test(dict) ? inflateSync(raw) : raw;
    } catch {
      continue;
    }

    // Chromium writes the code as 8-bit RGB, but a greyscale or RGBA stream is
    // equally decodable, so each plausible channel count is tried.
    for (const channels of [3, 4, 1]) {
      if (pixels.length !== width * height * channels) continue;
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < width * height; i += 1) {
        const at = i * channels;
        const r = channels === 1 ? pixels[at] : pixels[at];
        const g = channels === 1 ? pixels[at] : pixels[at + 1];
        const b = channels === 1 ? pixels[at] : pixels[at + 2];
        rgba[i * 4] = r;
        rgba[i * 4 + 1] = g;
        rgba[i * 4 + 2] = b;
        rgba[i * 4 + 3] = 255;
      }
      const result = jsQR(rgba, width, height);
      if (result) {
        found.push(result.data);
        break;
      }
    }
  }

  return found;
}
