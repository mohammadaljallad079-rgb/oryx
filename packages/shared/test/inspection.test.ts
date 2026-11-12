import { describe, expect, it } from 'vitest';
import {
  CHASSIS_REGIONS,
  INSPECTION_SECTION_SPECS,
  INSPECTION_SECTION_KEYS,
  INSPECTION_TYPES,
  INSPECTION_TYPE_KEYS,
  PAINT_CONDITIONS,
  areasForTypes,
  chassisRegionSpec,
  inspectionResultsFor,
  inspectionSectionSpec,
  inspectionTypeSpec,
  isInspectionEditable,
  isInspectionSectionKey,
  isInspectionTypeKey,
  paintConditionSpec,
  sectionsForType,
  typeForSection,
} from '../src/inspection';

/**
 * The inspection catalogue is the contract between the API and the interface, so
 * it is asserted directly. These tests are the guard against an item being
 * dropped from a section without anyone noticing: the counts below are the
 * report's own counts.
 */
describe('inspection catalogue — section and item completeness', () => {
  it('declares all seven data areas', () => {
    expect(INSPECTION_SECTION_KEYS).toHaveLength(7);
    expect(INSPECTION_SECTION_SPECS.map((s) => s.key)).toEqual([...INSPECTION_SECTION_KEYS]);
  });

  it('offers exactly the four selectable inspection types of the approved report', () => {
    expect(INSPECTION_TYPE_KEYS).toHaveLength(4);
    expect(INSPECTION_TYPES.map((t) => t.key)).toEqual([...INSPECTION_TYPE_KEYS]);
    expect(INSPECTION_TYPES.map((t) => t.labelEn)).toEqual([
      'Vehicle Paint & Body Check',
      'Chassis & Undercarriage Condition',
      'Interior & Exterior / Engine Compartment / Road Test',
      'Computer Unit Inspection',
    ]);
  });

  it('covers every data area with exactly one type and expands back to areas', () => {
    // Every area belongs to exactly one type, so a selection never leaves an
    // area orphaned and never records the same area twice.
    for (const area of INSPECTION_SECTION_KEYS) {
      const owners = INSPECTION_TYPES.filter((t) => t.sections.includes(area));
      expect(owners, `${area} must belong to exactly one type`).toHaveLength(1);
      expect(typeForSection(area)).toBe(owners[0].key);
    }
    expect(sectionsForType('CABIN_AND_MECHANICAL')).toEqual([
      'INTERIOR',
      'EXTERIOR',
      'ENGINE_COMPARTMENT',
      'ROAD_TEST',
    ]);
    expect(areasForTypes(['PAINT_BODY', 'COMPUTER_UNIT'])).toEqual(['PAINT_BODY', 'COMPUTER_UNIT']);
    expect(areasForTypes(['CABIN_AND_MECHANICAL'])).toEqual([
      'INTERIOR',
      'EXTERIOR',
      'ENGINE_COMPARTMENT',
      'ROAD_TEST',
    ]);
    // Selecting all four types yields all seven areas, in catalogue order.
    expect(areasForTypes([...INSPECTION_TYPE_KEYS])).toEqual([...INSPECTION_SECTION_KEYS]);
  });

  it('rejects an unknown type rather than returning an empty type', () => {
    expect(() => inspectionTypeSpec('NOT_A_TYPE')).toThrow();
    expect(isInspectionTypeKey('CABIN_AND_MECHANICAL')).toBe(true);
    expect(isInspectionTypeKey('INTERIOR')).toBe(false);
  });

  it('carries the exact item count of each report table', () => {
    const counts = Object.fromEntries(
      INSPECTION_SECTION_SPECS.map((s) => [s.key, s.items.length]),
    );
    expect(counts).toEqual({
      PAINT_BODY: 0, // diagram-driven; the panels are markers, not a list
      CHASSIS_UNDERCARRIAGE: 0, // diagram-driven; the eight regions are separate
      INTERIOR: 12,
      EXTERIOR: 6,
      ENGINE_COMPARTMENT: 13,
      ROAD_TEST: 13,
      COMPUTER_UNIT: 0, // free-form diagnostic entries
    });
  });

  it('gives every item a distinct key and both language labels', () => {
    for (const section of INSPECTION_SECTION_SPECS) {
      const keys = section.items.map((i) => i.key);
      expect(new Set(keys).size, `${section.key} has a duplicate item key`).toBe(keys.length);
      for (const item of section.items) {
        expect(item.labelEn.trim(), `${item.key} is missing an English label`).not.toBe('');
        expect(item.labelAr.trim(), `${item.key} is missing an Arabic label`).not.toBe('');
      }
      expect(section.labelEn.trim()).not.toBe('');
      expect(section.labelAr.trim()).not.toBe('');
    }
  });

  it('uses the report result vocabulary per section', () => {
    // Interior and exterior carry a not-applicable state; engine, road test and
    // the two diagrams are strictly pass/fail.
    expect(inspectionResultsFor(inspectionSectionSpec('INTERIOR'))).toEqual(['PASS', 'FAIL', 'NA']);
    expect(inspectionResultsFor(inspectionSectionSpec('EXTERIOR'))).toEqual(['PASS', 'FAIL', 'NA']);
    expect(inspectionResultsFor(inspectionSectionSpec('ENGINE_COMPARTMENT'))).toEqual(['PASS', 'FAIL']);
    expect(inspectionResultsFor(inspectionSectionSpec('ROAD_TEST'))).toEqual(['PASS', 'FAIL']);
  });

  it('keeps the report page grouping for Phase 3 document generation', () => {
    const byPage = INSPECTION_SECTION_SPECS.reduce<Record<number, string[]>>((acc, s) => {
      (acc[s.page] ??= []).push(s.key);
      return acc;
    }, {});
    // The approved five-page report: paint on page 2, chassis on page 3, the
    // interior/exterior/engine/road group on page 4 and the computer unit on
    // page 5.
    expect(byPage[2]).toEqual(['PAINT_BODY']);
    expect(byPage[3]).toEqual(['CHASSIS_UNDERCARRIAGE']);
    expect(byPage[4]).toEqual(['INTERIOR', 'EXTERIOR', 'ENGINE_COMPARTMENT', 'ROAD_TEST']);
    expect(byPage[5]).toEqual(['COMPUTER_UNIT']);
  });

  it('rejects an unknown section rather than returning an empty checklist', () => {
    expect(() => inspectionSectionSpec('NOT_A_SECTION')).toThrow();
    expect(isInspectionSectionKey('PAINT_BODY')).toBe(true);
    expect(isInspectionSectionKey('nope')).toBe(false);
  });
});

describe('inspection catalogue — paint conditions', () => {
  it('declares the four body-panel conditions with the report colours', () => {
    expect(PAINT_CONDITIONS.map((c) => c.key)).toEqual(['PAINT', 'FILLER', 'CHANGE', 'SECTIONED']);
    expect(paintConditionSpec('PAINT')).toMatchObject({ color: 'green', cross: false, labelAr: 'صبغ / رش' });
    expect(paintConditionSpec('FILLER')).toMatchObject({ color: 'orange', cross: false, labelAr: 'معجون' });
    expect(paintConditionSpec('CHANGE')).toMatchObject({ color: 'red', cross: false, labelAr: 'تبديل' });
    expect(paintConditionSpec('SECTIONED')).toMatchObject({ color: 'red', cross: true, labelAr: 'مقطوع' });
  });
});

describe('inspection catalogue — chassis regions', () => {
  it('declares the eight safety regions with normalised coordinates inside the diagram', () => {
    expect(CHASSIS_REGIONS).toHaveLength(8);
    expect(CHASSIS_REGIONS.map((r) => r.key)).toEqual([
      'FRONT',
      'FRONT_LEFT',
      'FRONT_RIGHT',
      'MIDDLE_LEFT',
      'MIDDLE_RIGHT',
      'REAR_LEFT',
      'REAR_RIGHT',
      'REAR',
    ]);
    for (const region of CHASSIS_REGIONS) {
      expect(region.x).toBeGreaterThanOrEqual(0);
      expect(region.x).toBeLessThanOrEqual(1);
      expect(region.y).toBeGreaterThanOrEqual(0);
      expect(region.y).toBeLessThanOrEqual(1);
      expect(region.labelAr.trim()).not.toBe('');
    }
    expect(() => chassisRegionSpec('WING')).toThrow();
  });
});

describe('inspection catalogue — editability', () => {
  it('lets a draft, an in-progress and a returned inspection be edited, but not an approved one', () => {
    expect(isInspectionEditable('DRAFT')).toBe(true);
    expect(isInspectionEditable('IN_PROGRESS')).toBe(true);
    expect(isInspectionEditable('REJECTED')).toBe(true);
    expect(isInspectionEditable('PENDING_REVIEW')).toBe(false);
    expect(isInspectionEditable('APPROVED')).toBe(false);
    expect(isInspectionEditable('CANCELLED')).toBe(false);
  });
});
