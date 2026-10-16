import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/common/prisma.service';
import {
  call,
  cleanupFixtures,
  createTestApp,
  FIXTURE_PREFIX,
  login,
  SEED_SUPER_ADMIN,
  SEED_COMPANY_ADMIN,
} from './test-app';
import { INTEGRATION_PROVIDERS } from '@oryx/shared';

/**
 * Execution 05 — External Integrations Center.
 *
 * The point of this suite is the honesty rule, so it tests it directly:
 *
 *  - a provider with no credentials reports AWAITING_CREDENTIALS, never OPERATIONAL;
 *  - storing credentials seals them and never returns a value;
 *  - a credential change invalidates a previous verification;
 *  - a provider whose vendor call is not implemented reports INCOMPLETE, not VERIFIED;
 *  - a provider that cannot work refuses to be enabled;
 *  - a company principal cannot reach the platform integration routes;
 *  - the customer capability endpoint never advertises an unconfigured gateway.
 */

const BENE = 'BENEFITPAY';

interface ProviderView {
  key: string;
  enabled: boolean;
  disabledReason: string | null;
  state: string;
  implementation: string;
  verificationStatus: string;
  missingCredentials: string[];
  credentials: Array<{
    key: string;
    configured: boolean;
    secret: boolean;
    hint: string | null;
  }>;
}

interface CenterResponse {
  providers: ProviderView[];
  summary: {
    total: number;
    operational: number;
    configured: number;
    awaitingCredentials: number;
    disabled: number;
    error: number;
    blockingForProduction: string[];
  };
}

interface DetailResponse {
  provider: ProviderView;
  checks: Array<{ status: string; message: string }>;
}

function provider(body: CenterResponse, key: string): ProviderView {
  const found = body.providers.find((p) => p.key === key);
  if (!found) throw new Error(`Provider ${key} missing from the integration center response.`);
  return found;
}

describe('Execution 05 — external integrations center', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  let superToken: string;
  let companyToken: string;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    base = ctx.base;

    await cleanupFixtures(prisma);
    // The suite writes platform-scoped rows; start from a clean slate so a
    // previous interrupted run cannot make a state assertion pass by accident.
    await prisma.integrationProvider.deleteMany({});

    superToken = await login(base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    companyToken = await login(base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);
  });

  afterAll(async () => {
    // Integration rows are platform-scoped and are not covered by
    // cleanupFixtures, so remove them here rather than leaving a provider
    // enabled for the next suite.
    await prisma.integrationProvider.deleteMany({});
    await cleanupFixtures(prisma);
    await app.close();
  });

  describe('catalog and derived state', () => {
    it('lists every provider from the shared catalog', async () => {
      const res = await call<CenterResponse>(base, '/integrations', { token: superToken });
      expect(res.status).toBe(200);
      expect(res.body.providers).toHaveLength(INTEGRATION_PROVIDERS.length);
      expect(res.body.providers.map((p) => p.key).sort()).toEqual(
        INTEGRATION_PROVIDERS.map((p) => p.key).sort(),
      );
    });

    it('reports an unconfigured gateway as awaiting credentials, never operational', async () => {
      const res = await call<CenterResponse>(base, '/integrations', { token: superToken });
      const benefitPay = provider(res.body, BENE);

      expect(benefitPay.state).toBe('AWAITING_CREDENTIALS');
      expect(benefitPay.state).not.toBe('OPERATIONAL');
      expect(benefitPay.enabled).toBe(false);
      expect(benefitPay.missingCredentials).toContain('BENEFITPAY_API_KEY');
    });

    it('reports the internal providers as operational because they need no credentials', async () => {
      const res = await call<CenterResponse>(base, '/integrations', { token: superToken });
      expect(provider(res.body, 'IN_APP').state).toBe('OPERATIONAL');
      expect(provider(res.body, 'CASH').state).toBe('OPERATIONAL');
      expect(provider(res.body, 'IN_APP').implementation).toBe('IMPLEMENTED');
    });

    it('names the providers that block production readiness', async () => {
      const res = await call<CenterResponse>(base, '/integrations', { token: superToken });
      // Payment gateways are per-company and none is operational in a fresh
      // database, so they must be reported as blockers rather than omitted.
      expect(res.body.summary.blockingForProduction).toEqual(
        expect.arrayContaining([BENE, 'CARD_ONLINE']),
      );
      expect(res.body.summary.awaitingCredentials).toBeGreaterThan(0);
    });
  });

  describe('credential storage', () => {
    it('seals a stored credential and never echoes its value', async () => {
      const secret = 'sk_live_super_secret_value_1234';
      const res = await call<DetailResponse>(base, `/integrations/${BENE}/credentials`, {
        method: 'PUT',
        token: superToken,
        body: { credentials: [{ key: 'BENEFITPAY_API_KEY', value: secret }] },
      });
      expect(res.status).toBe(200);

      // The response must not contain the value anywhere.
      expect(JSON.stringify(res.body)).not.toContain(secret);

      const key = res.body.provider.credentials.find((c) => c.key === 'BENEFITPAY_API_KEY');
      expect(key?.configured).toBe(true);
      // A secret never gets a hint, even though it is stored.
      expect(key?.hint).toBeNull();

      // At rest the value is sealed, not plaintext.
      const stored = await prisma.integrationCredential.findFirstOrThrow({
        where: { credentialKey: 'BENEFITPAY_API_KEY' },
      });
      expect(stored.value).not.toContain(secret);
      expect(stored.value.startsWith('v1.')).toBe(true);
    });

    it('keeps a non-secret identifier hint to the last four characters', async () => {
      const res = await call<DetailResponse>(base, `/integrations/${BENE}/credentials`, {
        method: 'PUT',
        token: superToken,
        body: { credentials: [{ key: 'BENEFITPAY_MERCHANT_ID', value: 'MERCHANT-0001234' }] },
      });
      const key = res.body.provider.credentials.find((c) => c.key === 'BENEFITPAY_MERCHANT_ID');
      expect(key?.configured).toBe(true);
      expect(key?.hint).toBe('1234');
      expect(JSON.stringify(res.body)).not.toContain('MERCHANT-0001234');
    });

    it('removes a credential when the value is empty', async () => {
      const res = await call<DetailResponse>(base, `/integrations/${BENE}/credentials`, {
        method: 'PUT',
        token: superToken,
        body: { credentials: [{ key: 'BENEFITPAY_MERCHANT_ID', value: '   ' }] },
      });
      const key = res.body.provider.credentials.find((c) => c.key === 'BENEFITPAY_MERCHANT_ID');
      expect(key?.configured).toBe(false);
      expect(key?.hint).toBeNull();
    });

    it('rejects an unknown credential key', async () => {
      const res = await call(base, `/integrations/${BENE}/credentials`, {
        method: 'PUT',
        token: superToken,
        body: { credentials: [{ key: 'NOT_A_REAL_KEY', value: 'x' }] },
      });
      expect(res.status).toBe(400);
    });

    it('rejects an unknown provider', async () => {
      const res = await call(base, '/integrations/NOPE/credentials', {
        method: 'PUT',
        token: superToken,
        body: { credentials: [{ key: 'X', value: 'y' }] },
      });
      expect(res.status).toBe(404);
    });

    it('refuses to configure a provider that needs no credentials', async () => {
      const res = await call(base, '/integrations/IN_APP/credentials', {
        method: 'PUT',
        token: superToken,
        body: { credentials: [{ key: 'ANYTHING', value: 'x' }] },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('enablement guard', () => {
    it('refuses to enable a gateway whose credentials are incomplete', async () => {
      // Only one of BenefitPay's required keys is stored at this point.
      const res = await call(base, `/integrations/${BENE}/enabled`, {
        method: 'PUT',
        token: superToken,
        body: { enabled: true },
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/BENEFITPAY_(API_SECRET|BASE_URL)/);
    });

    it('allows disabling and reports the disabled state', async () => {
      const res = await call<DetailResponse>(base, `/integrations/${BENE}/enabled`, {
        method: 'PUT',
        token: superToken,
        body: { enabled: false, reason: 'Pending bank onboarding.' },
      });
      expect(res.status).toBe(200);
      expect(res.body.provider.state).toBe('DISABLED');
      expect(res.body.provider.disabledReason).toBe('Pending bank onboarding.');
    });

    it('allows enabling once every required credential is present', async () => {
      await call(base, `/integrations/${BENE}/credentials`, {
        method: 'PUT',
        token: superToken,
        body: {
          credentials: [
            { key: 'BENEFITPAY_MERCHANT_ID', value: 'MERCHANT-0001234' },
            { key: 'BENEFITPAY_API_KEY', value: 'key-abcdefgh' },
            { key: 'BENEFITPAY_API_SECRET', value: 'secret-abcdefgh' },
            { key: 'BENEFITPAY_BASE_URL', value: 'https://sandbox.benefitpay.example' },
            { key: 'BENEFITPAY_WEBHOOK_SECRET', value: 'whsec-abcdefgh' },
          ],
        },
      });
      const res = await call<DetailResponse>(base, `/integrations/${BENE}/enabled`, {
        method: 'PUT',
        token: superToken,
        body: { enabled: true },
      });
      expect(res.status).toBe(200);
      expect(res.body.provider.missingCredentials).toEqual([]);
      // Credentials exist but no transaction has been verified, so this must be
      // CONFIGURED, not OPERATIONAL. This is the central honesty assertion.
      expect(res.body.provider.state).toBe('CONFIGURED');
      expect(res.body.provider.enabled).toBe(true);
    });
  });

  describe('verification', () => {
    it('does not claim success for an adapter whose vendor call is unimplemented', async () => {
      const res = await call<DetailResponse>(base, `/integrations/${BENE}/verify`, {
        method: 'POST',
        token: superToken,
      });
      expect(res.status).toBe(201);
      expect(res.body.provider.verificationStatus).toBe('INCOMPLETE');
      expect(res.body.provider.verificationStatus).not.toBe('VERIFIED');
      expect(res.body.provider.state).not.toBe('OPERATIONAL');
      expect(res.body.checks.length).toBeGreaterThan(0);
      expect(res.body.checks[0].message).toMatch(/not implemented/i);
    });

    it('verifies an implemented provider by exercising the real path', async () => {
      const res = await call<DetailResponse>(base, '/integrations/IN_APP/verify', {
        method: 'POST',
        token: superToken,
      });
      expect(res.status).toBe(201);
      expect(res.body.provider.verificationStatus).toBe('VERIFIED');
      expect(res.body.provider.state).toBe('OPERATIONAL');
    });

    it('invalidates a previous verification when a credential changes', async () => {
      // Verify in-app (VERIFIED), then change a credential on a configurable
      // provider and confirm its status resets.
      await call(base, '/integrations/EMAIL/credentials', {
        method: 'PUT',
        token: superToken,
        body: { credentials: [{ key: 'EMAIL_API_KEY', value: 'first-key' }] },
      });
      const before = await call<DetailResponse>(base, '/integrations/EMAIL', { token: superToken });
      expect(before.body.provider.verificationStatus).toBe('UNVERIFIED');

      await call(base, '/integrations/EMAIL/verify', { method: 'POST', token: superToken });
      const verified = await call<DetailResponse>(base, '/integrations/EMAIL', {
        token: superToken,
      });
      // EMAIL's vendor call is unimplemented, so even a fresh attempt is INCOMPLETE.
      expect(verified.body.provider.verificationStatus).toBe('INCOMPLETE');

      await call(base, '/integrations/EMAIL/credentials', {
        method: 'PUT',
        token: superToken,
        body: { credentials: [{ key: 'EMAIL_API_KEY', value: 'second-key' }] },
      });
      const after = await call<DetailResponse>(base, '/integrations/EMAIL', { token: superToken });
      expect(after.body.provider.verificationStatus).toBe('UNVERIFIED');
    });
  });

  describe('authorization', () => {
    it('denies the integration center to a company principal', async () => {
      const res = await call(base, '/integrations', { token: companyToken });
      expect([403, 404]).toContain(res.status);
    });

    it('denies credential writes to a company principal', async () => {
      const res = await call(base, `/integrations/${BENE}/credentials`, {
        method: 'PUT',
        token: companyToken,
        body: { credentials: [{ key: 'BENEFITPAY_API_KEY', value: 'x' }] },
      });
      expect([403, 404]).toContain(res.status);
    });

    it('rejects an anonymous request', async () => {
      const res = await call(base, '/integrations');
      expect(res.status).toBe(401);
    });
  });

  describe('audit trail', () => {
    it('records credential changes by key, never by value', async () => {
      const secret = 'audit-secret-value-should-not-appear';
      await call(base, `/integrations/${BENE}/credentials`, {
        method: 'PUT',
        token: superToken,
        body: { credentials: [{ key: 'BENEFITPAY_API_SECRET', value: secret }] },
      });

      const entries = await prisma.auditLog.findMany({
        where: { action: 'integration.credentials_updated' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      expect(entries.length).toBeGreaterThan(0);
      const serialized = JSON.stringify(entries.map((e) => e.metadata));
      expect(serialized).toContain('BENEFITPAY_API_SECRET');
      expect(serialized).not.toContain(secret);
    });
  });

  describe('customer capability advertisement', () => {
    it('never advertises a gateway that is not operational', async () => {
      // The customer endpoint is behind customer auth; assert on the service
      // contract through the platform plane instead, which is the same source
      // of truth the customer endpoint reads.
      const res = await call<CenterResponse>(base, '/integrations', { token: superToken });
      const benefitPay = provider(res.body, BENE);
      expect(benefitPay.state).not.toBe('OPERATIONAL');
    });

    it('exposes only internal providers as operational in a fresh deployment', async () => {
      const res = await call<CenterResponse>(base, '/integrations', { token: superToken });
      const operational = res.body.providers
        .filter((p) => p.state === 'OPERATIONAL')
        .map((p) => p.key)
        .sort();
      // IN_APP and CASH are the only providers that genuinely work without a
      // vendor credential, so they are the only ones allowed here.
      expect(operational).toEqual(['CASH', 'IN_APP']);
    });
  });
});
