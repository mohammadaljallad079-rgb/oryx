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

  // Execution 02 — ERP rows, deleted children first so foreign keys hold.
  await prisma.paymentAllocation.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.stockMovement.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.stockLevel.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.stockTransferLine.deleteMany({ where: { transfer: { companyId: { in: ids } } } });
  await prisma.stockTransfer.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.stockAdjustmentLine.deleteMany({ where: { adjustment: { companyId: { in: ids } } } });
  await prisma.stockAdjustment.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.posSaleLine.deleteMany({ where: { posSale: { companyId: { in: ids } } } });
  await prisma.posSale.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.cashierSession.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.salesInvoiceLine.deleteMany({ where: { invoice: { companyId: { in: ids } } } });
  await prisma.salesInvoice.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.creditNoteLine.deleteMany({ where: { creditNote: { companyId: { in: ids } } } });
  await prisma.creditNote.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.salesOrderLine.deleteMany({ where: { order: { companyId: { in: ids } } } });
  await prisma.salesOrder.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.quotationLine.deleteMany({ where: { quotation: { companyId: { in: ids } } } });
  await prisma.quotation.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.purchaseReturnLine.deleteMany({ where: { purchaseReturn: { companyId: { in: ids } } } });
  await prisma.purchaseReturn.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.supplierInvoiceLine.deleteMany({ where: { invoice: { companyId: { in: ids } } } });
  await prisma.supplierInvoice.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.goodsReceiptLine.deleteMany({ where: { receipt: { companyId: { in: ids } } } });
  await prisma.goodsReceipt.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.purchaseOrderLine.deleteMany({ where: { order: { companyId: { in: ids } } } });
  await prisma.purchaseOrder.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.purchaseRequisitionLine.deleteMany({ where: { requisition: { companyId: { in: ids } } } });
  await prisma.purchaseRequisition.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.journalLine.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.journalEntry.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.accountBalance.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.fiscalPeriod.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.fiscalYear.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.supplier.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.documentSequence.deleteMany({ where: { companyId: { in: ids } } });

  // Execution 03 — delete children before parents so foreign keys hold.
  await prisma.advanceSettlement.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.employeeAdvance.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.payslipLine.deleteMany({ where: { payslip: { companyId: { in: ids } } } });
  await prisma.payslip.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.payrollRun.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.payrollPeriod.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.salaryComponent.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.salaryStructure.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.attendanceRecord.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.employeeShift.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.shift.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.leaveRequest.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.leaveBalance.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.leaveType.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.employeeLifecycleItem.deleteMany({ where: { lifecycle: { companyId: { in: ids } } } });
  await prisma.employeeLifecycle.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.employeeDocument.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.employmentContract.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.employee.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.jobTitle.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.department.deleteMany({ where: { companyId: { in: ids } } });

  await prisma.customerSegmentMember.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.customerSegment.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.ticketMessage.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.supportTicket.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.slaPolicy.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.crmActivity.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.customerContact.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.opportunity.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.pipelineStage.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.pipeline.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.lead.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.leadSource.deleteMany({ where: { companyId: { in: ids } } });

  await prisma.notification.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.operationalCalendarEvent.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.entityAttachment.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.entityComment.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.approvalRequest.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.workOrderChecklistItem.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.workOrder.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.projectTask.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.project.deleteMany({ where: { companyId: { in: ids } } });

  // Providers created by tests are identified by their code prefix, since a
  // fixture provider may not be linked to a tenant company.
  await prisma.providerSettlement.deleteMany({ where: { provider: { OR: [{ providerCompanyId: { in: ids } }, { code: { startsWith: FIXTURE_PREFIX } }] } } });
  await prisma.marketplaceCommission.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.serviceRequest.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.providerServiceListing.deleteMany({ where: { provider: { OR: [{ providerCompanyId: { in: ids } }, { code: { startsWith: FIXTURE_PREFIX } }] } } });
  await prisma.marketplaceProvider.deleteMany({ where: { OR: [{ providerCompanyId: { in: ids } }, { code: { startsWith: FIXTURE_PREFIX } }] } });
  await prisma.warrantyRecord.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.partsReservationLine.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.partsReservation.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.repairEstimateLine.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.repairEstimate.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.labourOperation.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.jobCard.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.maintenanceBooking.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.workshopBay.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.inspectionFinding.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.inspectionReport.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.inspectionBooking.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.inspectionChecklistItem.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.inspectionService.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.partCompatibility.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.partReference.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.vehicleMileageRecord.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.vehicleDocument.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.vehicle.deleteMany({ where: { companyId: { in: ids } } });
  // Customers are deleted only after every table that references them.
  await prisma.customer.deleteMany({ where: { companyId: { in: ids } } });
  // Products and warehouses are referenced by E03 parts tables, so they go last.
  await prisma.product.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.warehouse.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.account.deleteMany({ where: { companyId: { in: ids } } });

  await prisma.branch.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.company.deleteMany({ where: { id: { in: ids } } });
  await prisma.plan.deleteMany({ where: { code: { startsWith: FIXTURE_PREFIX.toLowerCase() } } });
}
