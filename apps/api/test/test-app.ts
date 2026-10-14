import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/main';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../src/common/prisma.service';
import { MODULES } from '@oryx/shared';

/**
 * Shared harness for the API integration suites.
 *
 * The suites run against the real HTTP surface, guards and Prisma layer, using
 * the seeded development database. Fixtures use a distinctive prefix so they
 * are easy to identify and remove.
 */

export const FIXTURE_PREFIX = 'AUTHZ';

export const SEED_SUPER_ADMIN = {
  email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

export const SEED_COMPANY_ADMIN = {
  email: 'admin@demo-alnoor.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

export const SEED_ORYX_AUTO_ADMIN = {
  email: 'admin@oryx-auto.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  base: string;
}

export async function createTestApp(): Promise<TestContext> {
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const prisma = app.get(PrismaService);
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  return { app, prisma, base: url };
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ApiResult<T> {
  status: number;
  body: T;
}

export async function call<T = unknown>(
  base: string,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${base}/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body: body as T };
}

/**
 * Calls a company-scoped route with the explicit company context header.
 *
 * A company principal with more than one membership must select a company;
 * the guard rejects cross-tenant route resolution otherwise. This mirrors how
 * the admin UI sends `x-oryx-company-id` on every request.
 */
export async function companyCall<T = unknown>(
  base: string,
  companyId: string,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  return call<T>(base, path, {
    ...options,
    headers: { ...(options.headers ?? {}), 'x-oryx-company-id': companyId },
  });
}

export async function login(base: string, email: string, password: string): Promise<string> {
  const res = await call<{ accessToken: string }>(base, '/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken;
}

/**
 * Minimal cookie jar so suites can exercise the HttpOnly refresh-cookie flow the
 * same way a browser does.
 */
export class CookieJar {
  private readonly store = new Map<string, string>();
  /** Raw Set-Cookie lines from the most recent response. */
  lastRaw: string[] = [];

  absorb(res: Response): void {
    this.lastRaw = res.headers.getSetCookie?.() ?? [];
    for (const line of this.lastRaw) {
      const [pair] = line.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) {
        this.store.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    }
  }

  get(name: string): string | undefined {
    const value = this.store.get(name);
    return value && value.length > 0 ? value : undefined;
  }

  header(): string {
    return [...this.store.entries()]
      .filter(([, v]) => v.length > 0)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}

/** Like `call`, but cookie-aware and returning the raw response too. */
export async function jarCall<T = unknown>(
  base: string,
  path: string,
  options: RequestOptions & { jar?: CookieJar; csrf?: string } = {},
): Promise<ApiResult<T> & { res: Response }> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.jar) headers.Cookie = options.jar.header();
  if (options.csrf) headers['x-oryx-csrf'] = options.csrf;

  const res = await fetch(`${base}/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  options.jar?.absorb(res);

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body: body as T, res };
}

/** Generate a TOTP code for a base32 secret (RFC 6238, SHA-1, 6 digits). */
export function generateTotp(secret: string, atMs: number = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = secret.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / 30)));
  const hmac = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

/** Removes fixtures created by the suites (children first). */
export async function cleanupFixtures(prisma: PrismaService): Promise<void> {
  // Seeded accounts are shared between suites. Reset their MFA state so the
  // authorization suites can authenticate with a password alone; the dedicated
  // MFA suite enrolls and cleans up after itself.
  await prisma.mfaRecoveryCode.deleteMany({});
  await prisma.user.updateMany({
    where: { email: { in: [SEED_SUPER_ADMIN.email, SEED_COMPANY_ADMIN.email, SEED_ORYX_AUTO_ADMIN.email] } },
    data: {
      mfaEnabled: false,
      mfaSecretEncrypted: null,
      mfaPendingSecretEncrypted: null,
      mfaPendingExpiresAt: null,
      mfaLastUsedStep: null,
      mfaEnrolledAt: null,
    },
  });

  // Fixture users are removed so repeated runs start from a clean slate and the
  // seeded company-admin password hash is always the original one.
  await prisma.user.deleteMany({ where: { email: { contains: `${FIXTURE_PREFIX.toLowerCase()}-` } } });

  // Fixture branches are removed wherever they landed, including on seeded
  // companies the suites must not permanently mutate.
  await prisma.membershipBranch.deleteMany({ where: { branch: { code: { startsWith: FIXTURE_PREFIX } } } });
  await prisma.branch.deleteMany({ where: { code: { startsWith: FIXTURE_PREFIX } } });

  // The plan-edit test mutates the shared Enterprise plan; restore it from the
  // module catalog so the seeded baseline is always intact.
  const enterprise = await prisma.plan.findUnique({ where: { code: 'enterprise' } });
  if (enterprise) {
    await prisma.planModule.deleteMany({ where: { planId: enterprise.id } });
    await prisma.planModule.createMany({
      data: MODULES.map((m) => ({ planId: enterprise.id, moduleKey: m.key })),
    });
  }

  const companies = await prisma.company.findMany({
    where: { code: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  const ids = companies.map((c) => c.id);
  if (ids.length === 0) {
    await prisma.plan.deleteMany({ where: { code: { startsWith: FIXTURE_PREFIX.toLowerCase() } } });
    return;
  }

  await prisma.subscriptionEvent.deleteMany({ where: { subscription: { companyId: { in: ids } } } });
  await prisma.subscription.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.invitation.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.membership.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.rolePermission.deleteMany({ where: { role: { companyId: { in: ids } } } });
  await prisma.role.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.branch.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.company.deleteMany({ where: { id: { in: ids } } });
  await prisma.plan.deleteMany({ where: { code: { startsWith: FIXTURE_PREFIX.toLowerCase() } } });
}
