import type { INestApplication } from '@nestjs/common';

/**
 * Rate-limiting regression suite.
 *
 * The other suites raise the throttle limits so they can perform many logins;
 * this suite boots a second application instance with a deliberately low login
 * limit and asserts that the limiter rejects excess attempts with HTTP 429.
 *
 * `@Throttle` reads its limit at decorator-evaluation time, so the environment
 * variable is set before the application modules are imported dynamically.
 */
describe('ORYX API rate limiting (e2e)', () => {
  let app: INestApplication;
  let base = '';

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = '3';
    process.env.MFA_ENCRYPTION_KEY =
      process.env.MFA_ENCRYPTION_KEY ?? 'test-mfa-encryption-key-min-32-characters-xyz';

    const { createApp } = await import('../src/main');
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  }, 90_000);

  afterAll(async () => {
    await app.close();
    process.env.AUTH_THROTTLE_LIMIT = '100000';
  }, 60_000);

  it('rejects login attempts beyond the configured limit with HTTP 429', async () => {
    const attempt = () =>
      fetch(`${base}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'rate-limit-probe@oryx.local', password: 'wrong-password-attempt' }),
      });

    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const res = await attempt();
      statuses.push(res.status);
    }

    // Early attempts fail on credentials; once the limit (3) is reached the
    // limiter takes over and returns 429.
    expect(statuses).toContain(429);
  });
});
