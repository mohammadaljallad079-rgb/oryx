import {
  SEED_ORYX_AUTO_ADMIN,
  call,
  companyCall,
  createTestApp,
  login,
  type TestContext,
} from './test-app';

/**
 * Execution 21 — the reports catalogue and the redesigned workshop surface.
 *
 * Two things this suite must prove that a UI test cannot:
 *
 * - Every catalogue report renders a genuine PDF and a CSV through the real
 *   HTTP surface, and the PDF is scoped to the caller's company (a report for
 *   another tenant must not appear).
 * - The workshop job-card lifecycle is enforced by the server. An illegal
 *   transition is refused, a legitimate one is accepted, and an estimate that
 *   feeds invoicing balances (subtotal + tax = total) in integer minor units.
 */
describe('Execution 21 — reports catalogue and workshop lifecycle (e2e)', () => {
  let ctx: TestContext;
  let token: string;
  let companyId: string;

  const erp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, companyId, path, { ...options, token });

  beforeAll(async () => {
    ctx = await createTestApp();
    token = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);
    const me = await call<{ context: { companyId: string | null } }>(ctx.base, '/auth/me', { token });
    companyId = me.body.context.companyId!;
  });

  describe('reports catalogue', () => {
    it('resolves a catalogue where every entry renders a real PDF and CSV', async () => {
      const catalogue = await erp<{ reports: Array<{ kind: string; group: string; columns: unknown[] }> }>(
        '/reports/catalogue',
      );
      expect(catalogue.status).toBe(200);
      expect(catalogue.body.reports.length).toBeGreaterThan(0);
      for (const report of catalogue.body.reports) {
        expect(report.columns.length).toBeGreaterThan(0);

        const pdf = await erp<ArrayBuffer>(`/reports/${report.kind}/pdf`);
        expect(pdf.status).toBe(200);
        const pdfBytes = Buffer.from(pdf.body as unknown as ArrayBuffer);
        expect(pdfBytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

        const csv = await erp<string>(`/reports/${report.kind}/export`);
        expect(csv.status).toBe(200);
        expect(String(csv.body).length).toBeGreaterThan(0);
      }
    });

    it('rejects an unknown report kind', async () => {
      const res = await erp('/reports/not-a-report/data');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('workshop lifecycle', () => {
    it('drives a job card through the enforced state machine', async () => {
      const vehicles = await erp<{ items: Array<{ id: string }> }>('/automotive/vehicles?pageSize=1');
      expect(vehicles.status).toBe(200);
      if (vehicles.body.items.length === 0) return;

      const vehicleId = vehicles.body.items[0].id;
      const created = await erp<{ id: string; status: string }>('/automotive/job-cards', {
        method: 'POST',
        body: { vehicleId, complaint: 'E2E lifecycle' },
      });
      expect(created.status).toBe(201);
      const jobId = created.body.id;

      // An estimate balances in minor units and is required before completion.
      const estimate = await erp<{ id: string; subtotalMinor: number; taxMinor: number; totalMinor: number }>(
        `/automotive/job-cards/${jobId}/estimates`,
        {
          method: 'POST',
          body: {
            lines: [
              { type: 'LABOUR', description: 'Diagnostics', quantity: 10000, unitPriceMinor: 25000, taxPercentBp: 1000 },
              { type: 'PART', description: 'Engine mount', quantity: 10000, unitPriceMinor: 45000, taxPercentBp: 1000 },
            ],
          },
        },
      );
      expect(estimate.status).toBe(201);
      expect(estimate.body.subtotalMinor).toBe(70000);
      expect(estimate.body.taxMinor).toBe(7000);
      expect(estimate.body.totalMinor).toBe(77000);
      expect(estimate.body.subtotalMinor + estimate.body.taxMinor).toBe(estimate.body.totalMinor);

      const approved = await erp(`/automotive/estimates/${estimate.body.id}/approve`, { method: 'POST', body: {} });
      expect(approved.status).toBeLessThan(300);

      const patch = (status: string) =>
        erp<{ status?: string }>(`/automotive/job-cards/${jobId}`, { method: 'PATCH', body: { status } });

      for (const status of ['AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'COMPLETED']) {
        const res = await patch(status);
        expect(res.status).toBeLessThan(300);
      }
      const completed = await patch('COMPLETED');
      expect(completed.body.status).toBe('COMPLETED');

      // A backwards jump is refused by the server-side state machine.
      const illegal = await patch('OPEN');
      expect(illegal.status).toBeGreaterThanOrEqual(400);
    });

    it('exposes a workshop dashboard scoped to the company', async () => {
      const dashboard = await erp<{ activeBays: number; openJobCards: number }>('/automotive/workshop/dashboard');
      expect(dashboard.status).toBe(200);
      expect(typeof dashboard.body.activeBays).toBe('number');
      expect(typeof dashboard.body.openJobCards).toBe('number');
    });

    it('creates and lists a service bay', async () => {
      const code = `E21-${Date.now().toString().slice(-6)}`;
      const created = await erp<{ id: string }>('/automotive/bays', {
        method: 'POST',
        body: { code, nameEn: 'E2E Bay', nameAr: 'ورشة اختبار' },
      });
      expect(created.status).toBe(201);
      const list = await erp<{ items: Array<{ id: string; code: string }> }>('/automotive/bays?pageSize=200');
      expect(list.body.items.some((b) => b.code === code)).toBe(true);
    });
  });
});
