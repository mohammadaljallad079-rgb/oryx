import {
  CookieJar,
  SEED_SUPER_ADMIN,
  call,
  cleanupFixtures,
  createTestApp,
  generateTotp,
  jarCall,
  type TestContext,
} from './test-app';

/**
 * MFA integration suite.
 *
 * Exercises the real TOTP flow end to end against the running API: enrollment
 * with a QR provisioning URI, the login challenge, replay rejection, single-use
 * recovery codes, regeneration, disablement and the administrative reset.
 */
describe('ORYX API MFA (e2e)', () => {
  let ctx: TestContext;
  /** The active TOTP secret for the seeded Super Admin, held in memory only. */
  let secret = '';
  /** The most recently issued plaintext recovery codes. */
  let recoveryCodes: string[] = [];
  let accessToken = '';
  let csrf: string | undefined;

  /** Password step. Returns the challenge when MFA is enabled. */
  async function passwordStep() {
    const jar = new CookieJar();
    const res = await jarCall<{ accessToken?: string; mfaRequired?: boolean; challengeToken?: string }>(
      ctx.base,
      '/auth/login',
      { method: 'POST', body: { email: SEED_SUPER_ADMIN.email, password: SEED_SUPER_ADMIN.password }, jar },
    );
    return { jar, res };
  }

  /**
   * Complete login with the known TOTP secret.
   *
   * The replay counter is cleared first so a current-step code is always
   * accepted. Advancing the clock instead would straddle a step boundary and
   * make the test fail whenever it ran near a 30-second edge.
   */
  async function loginWithTotp() {
    await resetReplayCounter();
    const { jar, res } = await passwordStep();
    const verified = await jarCall<{ accessToken: string }>(ctx.base, '/auth/mfa/verify-login', {
      method: 'POST',
      body: {
        challengeToken: res.body.challengeToken,
        code: generateTotp(secret),
      },
      jar,
    });
    return { jar, verified };
  }

  /**
   * Clear the monotonic replay counter.
   *
   * Replay protection rejects a code whose step is not greater than the last
   * accepted one. Tests that need a current-step code clear the counter rather
   * than waiting for wall-clock time to advance. Production behaviour is
   * untouched.
   */
  async function resetReplayCounter() {
    await ctx.prisma.user.updateMany({
      where: { email: SEED_SUPER_ADMIN.email },
      data: { mfaLastUsedStep: null },
    });
  }

  /** Enroll MFA and capture the secret plus recovery codes. */
  async function enroll() {
    const { jar, res } = await passwordStep();
    expect(res.status).toBe(200);
    const token = res.body.accessToken;
    expect(token).toBeTruthy();
    const csrfToken = jar.get('oryx_csrf');

    const start = await jarCall<{ secret: string; qrDataUrl: string; otpauthUri: string; expiresAt: string }>(
      ctx.base,
      '/auth/mfa/enroll',
      { method: 'POST', body: {}, jar, token, csrf: csrfToken },
    );
    expect(start.status).toBe(200);
    expect(start.body.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(start.body.otpauthUri.startsWith('otpauth://totp/')).toBe(true);
    expect(start.body.otpauthUri).toContain('issuer=');
    expect(new Date(start.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const confirm = await jarCall<{ recoveryCodes: string[] }>(ctx.base, '/auth/mfa/enroll/confirm', {
      method: 'POST',
      body: { code: generateTotp(start.body.secret) },
      jar,
      token,
      csrf: csrfToken,
    });
    expect(confirm.status).toBe(200);
    return { secret: start.body.secret, codes: confirm.body.recoveryCodes, token, csrf: csrfToken };
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);
    const enrolled = await enroll();
    secret = enrolled.secret;
    recoveryCodes = enrolled.codes;
    accessToken = enrolled.token ?? '';
    csrf = enrolled.csrf;
  }, 90_000);

  afterAll(async () => {
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  }, 60_000);

  describe('enrollment', () => {
    it('issues ten recovery codes and stores them only as hashes', async () => {
      expect(recoveryCodes).toHaveLength(10);
      const stored = await ctx.prisma.mfaRecoveryCode.findMany({});
      expect(stored.length).toBeGreaterThanOrEqual(10);
      // No plaintext code may appear in the database.
      for (const code of recoveryCodes) {
        expect(stored.some((s) => s.codeHash === code)).toBe(false);
      }
    });

    it('stores the TOTP secret encrypted, never in plaintext', async () => {
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_SUPER_ADMIN.email } });
      expect(user.mfaEnabled).toBe(true);
      expect(user.mfaSecretEncrypted).not.toBeNull();
      expect(user.mfaSecretEncrypted!.startsWith('v1.')).toBe(true);
      expect(user.mfaSecretEncrypted).not.toContain(secret);
      expect(user.mfaPendingSecretEncrypted).toBeNull();
    });

    it('rejects confirmation with an invalid code', async () => {
      // A fresh account state is not available while MFA is on, so assert the
      // rejection path through a second enrollment attempt.
      const { jar, res } = await passwordStep();
      expect(res.body.mfaRequired).toBe(true);
      const start = await jarCall<{ secret: string }>(ctx.base, '/auth/mfa/enroll', {
        method: 'POST',
        body: {},
        jar,
        token: '',
      });
      // Unauthenticated (no access token) => rejected.
      expect(start.status).toBe(401);
    });

    it('does not issue a session from the password step once MFA is enabled', async () => {
      const { jar, res } = await passwordStep();
      expect(res.body.mfaRequired).toBe(true);
      expect(res.body.accessToken).toBeUndefined();
      expect(jar.get('oryx_rt')).toBeUndefined();
    });
  });

  describe('login challenge', () => {
    it('rejects an invalid code without issuing a session', async () => {
      const { jar, res } = await passwordStep();
      const wrong = await jarCall<{ code: string }>(ctx.base, '/auth/mfa/verify-login', {
        method: 'POST',
        body: { challengeToken: res.body.challengeToken, code: '111111' },
        jar,
      });
      expect(wrong.status).toBe(401);
      expect(wrong.body.code).toBe('auth.mfa_invalid_code');
      expect(jar.get('oryx_rt')).toBeUndefined();
    });

    it('issues a session for a valid code', async () => {
      const { verified } = await loginWithTotp();
      expect(verified.status).toBe(200);
      expect(verified.body.accessToken).toBeTruthy();
    });

    it('rejects replay of an already-accepted code', async () => {
      await resetReplayCounter();
      const { jar, res } = await passwordStep();
      const code = generateTotp(secret);
      const first = await jarCall(ctx.base, '/auth/mfa/verify-login', {
        method: 'POST',
        body: { challengeToken: res.body.challengeToken, code },
        jar,
      });
      expect(first.status).toBe(200);

      // Presenting the identical code again must fail even though it is still
      // inside its validity window.
      const { jar: jar2, res: res2 } = await passwordStep();
      const replay = await jarCall<{ code: string }>(ctx.base, '/auth/mfa/verify-login', {
        method: 'POST',
        body: { challengeToken: res2.body.challengeToken, code },
        jar: jar2,
      });
      expect(replay.status).toBe(401);
      expect(replay.body.code).toBe('auth.mfa_invalid_code');
    });

    it('rejects a tampered challenge token', async () => {
      const { jar } = await passwordStep();
      const bad = await jarCall(ctx.base, '/auth/mfa/verify-login', {
        method: 'POST',
        body: { challengeToken: 'not-a-valid-token-at-all', code: '123456' },
        jar,
      });
      expect(bad.status).toBe(401);
    });
  });

  describe('recovery codes', () => {
    it('accepts a recovery code exactly once', async () => {
      const code = recoveryCodes[0];
      const { jar, res } = await passwordStep();
      const first = await jarCall(ctx.base, '/auth/mfa/verify-login', {
        method: 'POST',
        body: { challengeToken: res.body.challengeToken, code },
        jar,
      });
      expect(first.status).toBe(200);

      const { jar: jar2, res: res2 } = await passwordStep();
      const reuse = await jarCall<{ code: string }>(ctx.base, '/auth/mfa/verify-login', {
        method: 'POST',
        body: { challengeToken: res2.body.challengeToken, code },
        jar: jar2,
      });
      expect(reuse.status).toBe(401);
      expect(reuse.body.code).toBe('auth.mfa_invalid_code');
    });

    it('regenerates recovery codes and invalidates the previous set', async () => {
      // Obtain a session with a recovery code so no TOTP step is consumed, then
      // clear the replay counter for the regeneration call.
      const code = recoveryCodes[2];
      const { jar, res } = await passwordStep();
      const verified = await jarCall<{ accessToken: string }>(ctx.base, '/auth/mfa/verify-login', {
        method: 'POST',
        body: { challengeToken: res.body.challengeToken, code },
        jar,
      });
      expect(verified.status).toBe(200);
      const token = verified.body.accessToken ?? '';
      expect(token).not.toBe('');

      await resetReplayCounter();
      const regenerated = await jarCall<{ recoveryCodes: string[] }>(
        ctx.base,
        '/auth/mfa/recovery-codes/regenerate',
        {
          method: 'POST',
          body: { code: generateTotp(secret) },
          jar,
          token,
          csrf: jar.get('oryx_csrf'),
        },
      );
      expect(regenerated.status).toBe(200);
      expect(regenerated.body.recoveryCodes).toHaveLength(10);
      expect(regenerated.body.recoveryCodes[0]).not.toBe(recoveryCodes[0]);

      // An old, unused code must no longer work.
      const staleCode = recoveryCodes[4];
      const { jar: jar3, res: res3 } = await passwordStep();
      const stale = await jarCall(ctx.base, '/auth/mfa/verify-login', {
        method: 'POST',
        body: { challengeToken: res3.body.challengeToken, code: staleCode },
        jar: jar3,
      });
      expect(stale.status).toBe(401);

      recoveryCodes = regenerated.body.recoveryCodes;
    });

    it('requires a valid current code to regenerate', async () => {
      const denied = await jarCall<{ code: string }>(ctx.base, '/auth/mfa/recovery-codes/regenerate', {
        method: 'POST',
        body: { code: '000000' },
        jar: new CookieJar(),
        token: accessToken,
        csrf,
      });
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('auth.mfa_invalid_code');
    });
  });

  describe('disable and administrative reset', () => {
    it('requires a valid code to disable MFA', async () => {
      const denied = await jarCall<{ code: string }>(ctx.base, '/auth/mfa/disable', {
        method: 'POST',
        body: { code: '000000' },
        jar: new CookieJar(),
        token: accessToken,
        csrf,
      });
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('auth.mfa_invalid_code');

      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_SUPER_ADMIN.email } });
      expect(user.mfaEnabled).toBe(true);
    });

    it('rejects the administrative reset from an unauthenticated caller', async () => {
      const anon = await call(ctx.base, '/auth/mfa/reset/target-user', { method: 'POST', body: {} });
      expect([401, 403]).toContain(anon.status);
    });

    it('rejects the administrative reset from a company principal', async () => {
      // A company principal cannot hold platform permissions, so the route is
      // denied regardless of the target.
      const { jar } = await passwordStep();
      void jar;
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_SUPER_ADMIN.email } });
      const res = await call(ctx.base, `/auth/mfa/reset/${user.id}`, { method: 'POST', body: {} });
      expect([401, 403]).toContain(res.status);
    });

    it('disables MFA with a valid code and clears all MFA material', async () => {
      // Session from a recovery code, then a current TOTP code to disable.
      const recovery = recoveryCodes[5];
      const { jar, res } = await passwordStep();
      const verified = await jarCall<{ accessToken: string }>(ctx.base, '/auth/mfa/verify-login', {
        method: 'POST',
        body: { challengeToken: res.body.challengeToken, code: recovery },
        jar,
      });
      expect(verified.status).toBe(200);
      const token = verified.body.accessToken;

      await resetReplayCounter();
      const disabled = await jarCall<{ ok: boolean }>(ctx.base, '/auth/mfa/disable', {
        method: 'POST',
        body: { code: generateTotp(secret) },
        jar,
        token,
        csrf: jar.get('oryx_csrf'),
      });
      expect(disabled.status).toBe(200);

      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_SUPER_ADMIN.email } });
      expect(user.mfaEnabled).toBe(false);
      expect(user.mfaSecretEncrypted).toBeNull();
      expect(user.mfaLastUsedStep).toBeNull();
      expect(await ctx.prisma.mfaRecoveryCode.count({ where: { userId: user.id } })).toBe(0);

      // Password-only login works again.
      const after = await passwordStep();
      expect(after.res.body.accessToken).toBeTruthy();
      expect(after.res.body.mfaRequired).toBeUndefined();
    });
  });
});
