import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/main';
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

/** Removes fixtures created by the suites (children first). */
export async function cleanupFixtures(prisma: PrismaService): Promise<void> {
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
