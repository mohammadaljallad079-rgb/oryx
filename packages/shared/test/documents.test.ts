import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_VERIFICATION_STATUSES,
  OFFICIAL_DOCUMENTS,
  OFFICIAL_DOCUMENT_STATUSES,
  documentStatusLabelKey,
  isDocumentDownloadable,
  isStoredDocumentStatus,
  maskVin,
  ISSUABLE_FINANCIAL_TYPES,
  officialDocumentSpec,
  planInspectionReport,
  sectionsOnReportPage,
  verificationStatusFor,
  type OfficialDocumentType,
} from '../src/documents';
import {
  INSPECTION_SECTION_KEYS,
  INSPECTION_SECTION_SPECS,
  type InspectionSectionKey,
} from '../src/inspection';

const ALL = INSPECTION_SECTION_KEYS as readonly InspectionSectionKey[];

describe('official document catalogue', () => {
  it('declares every type exactly once', () => {
    const types = OFFICIAL_DOCUMENTS.map((d) => d.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('gives every document a bilingual label and a permission', () => {
    for (const doc of OFFICIAL_DOCUMENTS) {
      expect(doc.labelEn.length, doc.type).toBeGreaterThan(0);
      expect(doc.labelAr.length, doc.type).toBeGreaterThan(0);
      expect(doc.permission, doc.type).toMatch(/^[a-z]+\.[a-z]+\.[a-z]+$/);
    }
  });

  it('resolves a spec by type and rejects an unknown one', () => {
    expect(officialDocumentSpec('SALES_INVOICE').labelEn).toBe('Tax Invoice');
    expect(() => officialDocumentSpec('NOT_A_DOCUMENT')).toThrow();
  });

  it('marks the inspection report verifiable', () => {
    expect(officialDocumentSpec('VEHICLE_INSPECTION_REPORT').verifiable).toBe(true);
  });
});

describe('inspection report composition', () => {
  it('produces the original five pages for a complete inspection', () => {
    const plan = planInspectionReport(ALL);
    expect(plan).toHaveLength(5);
    expect(plan[0].kind).toBe('IDENTIFICATION');
    expect(plan.map((p) => p.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('never emits a page for an unselected section', () => {
    const plan = planInspectionReport(['PAINT_BODY']);
    expect(plan).toHaveLength(2);
    expect(plan[1].section).toBe('PAINT_BODY');
    expect(plan.some((p) => p.section === 'CHASSIS_UNDERCARRIAGE')).toBe(false);
  });

  it('renumbers pages dynamically so a partial report has no gaps', () => {
    for (const areas of [
      ['PAINT_BODY'],
      ['PAINT_BODY', 'CHASSIS_UNDERCARRIAGE'],
      ['INTERIOR'],
      ['COMPUTER_UNIT'],
      ALL,
    ] as InspectionSectionKey[][]) {
      const plan = planInspectionReport(areas);
      expect(plan.map((p) => p.number), areas.join('+')).toEqual(
        plan.map((_, i) => i + 1),
      );
    }
  });

  it('keeps paint and chassis on one page when both are selected', () => {
    const plan = planInspectionReport(['PAINT_BODY', 'CHASSIS_UNDERCARRIAGE']);
    // Both live on original page 2, so the document is identification + one page.
    expect(plan).toHaveLength(2);
    expect(plan[1].number).toBe(2);
    const onPage = sectionsOnReportPage(plan[1], ['PAINT_BODY', 'CHASSIS_UNDERCARRIAGE']);
    expect(onPage.map((s) => s.key)).toEqual(['PAINT_BODY', 'CHASSIS_UNDERCARRIAGE']);
  });

  it('uses the section title when one section stands alone, and the combined title when they share a page', () => {
    const alone = planInspectionReport(['INTERIOR']);
    expect(alone[1].titleEn).toBe('Interior Inspection');

    const together = planInspectionReport(['INTERIOR', 'EXTERIOR']);
    expect(together[1].titleEn).toBe('Interior & Exterior Inspection');
  });

  it('returns only the identification page when nothing is selected', () => {
    const plan = planInspectionReport([]);
    expect(plan).toHaveLength(1);
    expect(plan[0].kind).toBe('IDENTIFICATION');
  });

  it('places every section on exactly one planned page', () => {
    const plan = planInspectionReport(ALL);
    const covered = new Set<string>();
    for (const page of plan) {
      for (const s of sectionsOnReportPage(page, ALL)) covered.add(s.key);
    }
    expect([...covered].sort()).toEqual([...ALL].sort());
  });

  it('groups sections by their catalogue page, not by selection order', () => {
    // Reversed selection order must not reorder the printed pages.
    const reversed = [...ALL].reverse();
    const plan = planInspectionReport(reversed);
    expect(plan.map((p) => p.section)).toEqual(
      planInspectionReport(ALL).map((p) => p.section),
    );
  });

  it('keeps each section on the page the catalogue assigns it', () => {
    const plan = planInspectionReport(ALL);
    for (const page of plan) {
      if (page.kind !== 'SECTION') continue;
      for (const s of sectionsOnReportPage(page, ALL)) {
        const spec = INSPECTION_SECTION_SPECS.find((x) => x.key === s.key)!;
        expect(spec.page).toBe(
          INSPECTION_SECTION_SPECS.find((x) => x.key === page.section)!.page,
        );
      }
    }
  });
});

describe('verification projection', () => {
  it('reports an issued document as valid', () => {
    expect(verificationStatusFor('ISSUED')).toBe('VALID');
  });

  it('fails closed for a draft', () => {
    expect(verificationStatusFor('DRAFT')).toBe('REVOKED');
  });

  it('maps superseded, cancelled and revoked distinctly', () => {
    expect(verificationStatusFor('SUPERSEDED')).toBe('SUPERSEDED');
    expect(verificationStatusFor('CANCELLED')).toBe('CANCELLED');
    expect(verificationStatusFor('REVOKED')).toBe('REVOKED');
  });

  it('only offers a download for an issued or superseded document', () => {
    expect(isDocumentDownloadable('ISSUED')).toBe(true);
    expect(isDocumentDownloadable('SUPERSEDED')).toBe(true);
    expect(isDocumentDownloadable('CANCELLED')).toBe(false);
    expect(isDocumentDownloadable('REVOKED')).toBe(false);
    expect(isDocumentDownloadable('DRAFT')).toBe(false);
  });

  it('keeps the stored and public status vocabularies separate', () => {
    // The register renders the stored status and the verification page renders
    // the public one. An earlier revision labelled an `ISSUED` document
    // `VALID` in the register, which is the public word, and the badge then
    // printed the raw key because no dictionary entry existed for it.
    expect(OFFICIAL_DOCUMENT_STATUSES).toContain('ISSUED');
    expect(OFFICIAL_DOCUMENT_STATUSES).not.toContain('VALID' as never);
    expect(DOCUMENT_VERIFICATION_STATUSES).toContain('VALID');
    expect(DOCUMENT_VERIFICATION_STATUSES).not.toContain('ISSUED' as never);

    // Every stored status maps to exactly one public status.
    for (const status of OFFICIAL_DOCUMENT_STATUSES) {
      expect(DOCUMENT_VERIFICATION_STATUSES).toContain(verificationStatusFor(status));
    }
  });

  it('recognises a stored status and rejects the public vocabulary', () => {
    for (const status of OFFICIAL_DOCUMENT_STATUSES) expect(isStoredDocumentStatus(status)).toBe(true);
    expect(isStoredDocumentStatus('VALID')).toBe(false);
    expect(isStoredDocumentStatus('issued')).toBe(false);
    expect(isStoredDocumentStatus('')).toBe(false);
  });

  it('only produces a label key for a stored status', () => {
    expect(documentStatusLabelKey('ISSUED')).toBe('documents.status.ISSUED');
    expect(documentStatusLabelKey('REVOKED')).toBe('documents.status.REVOKED');
    // The public vocabulary and anything else must not resolve to a key, or a
    // register badge would print the raw token.
    expect(documentStatusLabelKey('VALID')).toBeNull();
    expect(documentStatusLabelKey('issued')).toBeNull();
    expect(documentStatusLabelKey('')).toBeNull();
  });

  it('masks all but the last four VIN characters', () => {
    expect(maskVin('JTMHV05J204123456')).toBe('•••••••••••••3456');
    expect(maskVin('ABC')).toBe('ABC');
  });

  it('exposes no financial fields in the public view type', () => {
    // A guard against a future field leaking amounts into the public page.
    const view: Record<string, unknown> = {
      status: 'VALID',
      type: 'SALES_INVOICE',
      typeLabelEn: 'Tax Invoice',
      typeLabelAr: 'فاتورة ضريبية',
      documentNumber: 'SI-1',
      version: 1,
      issuerNameEn: 'ORYX',
      issuerNameAr: 'أوريكس',
      issuerCode: 'ORYX-AUTO',
      issuedAt: new Date().toISOString(),
    };
    const banned = ['totalMinor', 'total', 'amount', 'customerName', 'email', 'phone'];
    for (const key of banned) expect(view).not.toHaveProperty(key);
  });

  it('declares the full status vocabulary', () => {
    expect([...DOCUMENT_VERIFICATION_STATUSES]).toEqual([
      'VALID',
      'SUPERSEDED',
      'CANCELLED',
      'REVOKED',
    ]);
  });

  it('has a catalogue spec for every document type used in the projection', () => {
    const types: OfficialDocumentType[] = OFFICIAL_DOCUMENTS.map((d) => d.type);
    for (const t of types) expect(() => officialDocumentSpec(t)).not.toThrow();
  });

  it('only lists issuable types that exist in the catalogue', () => {
    // The API whitelist and the admin issue buttons both read this list, so a
    // typo here would offer a document type the API cannot render.
    const catalogue = new Set(OFFICIAL_DOCUMENTS.map((d) => d.type));
    for (const t of ISSUABLE_FINANCIAL_TYPES) expect(catalogue.has(t)).toBe(true);
  });

  it('never lists the inspection report as a financial type', () => {
    // The report is issued from an inspection through its own route, so it must
    // not appear in the financial issue list.
    expect((ISSUABLE_FINANCIAL_TYPES as readonly string[]).includes('VEHICLE_INSPECTION_REPORT')).toBe(
      false,
    );
  });
});
