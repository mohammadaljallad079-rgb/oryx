import { QrService } from './qr.service';

/**
 * A printed QR code embeds an absolute URL that a phone opens with no context,
 * and the printed copy cannot be recalled. These tests pin the two properties
 * that matter: the configured origin is honoured, and production refuses to
 * emit a code that would resolve to a developer machine.
 */
describe('QrService.verificationUrl', () => {
  const service = new QrService();
  const token = 'tok_abc-123';
  const original = { base: process.env.DOCUMENT_VERIFY_BASE_URL, node: process.env.NODE_ENV };

  afterEach(() => {
    if (original.base === undefined) delete process.env.DOCUMENT_VERIFY_BASE_URL;
    else process.env.DOCUMENT_VERIFY_BASE_URL = original.base;
    if (original.node === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.node;
  });

  it('uses the configured public origin', () => {
    process.env.DOCUMENT_VERIFY_BASE_URL = 'https://oryxbhr.com';
    expect(service.verificationUrl(token)).toBe(`https://oryxbhr.com/verify/${token}`);
  });

  it('normalises a trailing slash on the configured origin', () => {
    process.env.DOCUMENT_VERIFY_BASE_URL = 'https://oryxbhr.com/';
    expect(service.verificationUrl(token)).toBe(`https://oryxbhr.com/verify/${token}`);
  });

  it('falls back to the local customer site outside production', () => {
    delete process.env.DOCUMENT_VERIFY_BASE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NODE_ENV = 'development';
    expect(service.verificationUrl(token)).toBe(`http://localhost:3000/verify/${token}`);
  });

  it('refuses to emit a localhost code in production', () => {
    delete process.env.DOCUMENT_VERIFY_BASE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NODE_ENV = 'production';
    expect(() => service.verificationUrl(token)).toThrow(/DOCUMENT_VERIFY_BASE_URL/);
  });

  it('issues an unguessable, URL-safe token', () => {
    const a = service.newToken();
    const b = service.newToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
