import { describe, expect, it } from 'vitest';
import {
  BODY_PANELS,
  BODY_VIEWBOX,
  BODY_WHEELS,
  CHASSIS_VIEWBOX,
  CHASSIS_ZONES,
  CHASSIS_ZONE_COLORS,
  INSPECTION_MARKER_COLORS,
  bodyPanelAt,
} from '../src/inspection-diagram';
import { CHASSIS_REGIONS } from '../src/inspection';

/**
 * The inspection geometry is shared by the admin editor and the official PDF, so
 * these assertions guard the contract between them rather than a rendering: if a
 * zone key drifts from the catalogue, or a coordinate leaves the drawing, the
 * two surfaces would silently disagree.
 */
describe('inspection diagram geometry — body panels', () => {
  it('declares a distinct key and both labels for every panel', () => {
    const keys = BODY_PANELS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const panel of BODY_PANELS) {
      expect(panel.labelEn.trim()).not.toBe('');
      expect(panel.labelAr.trim()).not.toBe('');
      expect(panel.d.startsWith('M')).toBe(true);
    }
  });

  it('keeps every panel inside the drawing box', () => {
    for (const panel of BODY_PANELS) {
      const nums = panel.d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      for (let i = 0; i + 1 < nums.length; i += 2) {
        expect(nums[i]).toBeGreaterThanOrEqual(0);
        expect(nums[i]).toBeLessThanOrEqual(BODY_VIEWBOX.width);
        expect(nums[i + 1]).toBeGreaterThanOrEqual(0);
        expect(nums[i + 1]).toBeLessThanOrEqual(BODY_VIEWBOX.height);
      }
    }
  });

  it('places a wheel patch at each corner inside the box', () => {
    expect(BODY_WHEELS).toHaveLength(4);
    for (const w of BODY_WHEELS) {
      expect(w.cx - w.r).toBeGreaterThanOrEqual(0);
      expect(w.cx + w.r).toBeLessThanOrEqual(BODY_VIEWBOX.width);
    }
  });

  it('resolves a normalised point to the panel it sits on', () => {
    // Left flank, mid-length: the front-left door.
    expect(bodyPanelAt(0.21, 0.38)?.key).toBe('frontLeftDoor');
    // Far above the vehicle: nothing.
    expect(bodyPanelAt(0.5, 0.01)).toBeNull();
  });
});

describe('inspection diagram geometry — chassis zones', () => {
  it('covers exactly the eight catalogue regions, in order', () => {
    expect(CHASSIS_ZONES.map((z) => z.key)).toEqual(CHASSIS_REGIONS.map((r) => r.key));
  });

  it('keeps every zone and its badge inside the drawing box', () => {
    for (const zone of CHASSIS_ZONES) {
      expect(zone.d.startsWith('M')).toBe(true);
      expect(zone.labelX).toBeGreaterThan(0);
      expect(zone.labelX).toBeLessThan(CHASSIS_VIEWBOX.width);
      expect(zone.labelY).toBeGreaterThan(0);
      expect(zone.labelY).toBeLessThan(CHASSIS_VIEWBOX.height);
    }
  });
});

describe('inspection diagram geometry — shared marker colours', () => {
  it('exposes one colour per paint condition name and for each chassis state', () => {
    expect(Object.keys(INSPECTION_MARKER_COLORS).sort()).toEqual(['green', 'orange', 'red']);
    expect(CHASSIS_ZONE_COLORS.OK).toBe(INSPECTION_MARKER_COLORS.green);
    expect(CHASSIS_ZONE_COLORS.DAMAGE).toBe(INSPECTION_MARKER_COLORS.red);
    expect(CHASSIS_ZONE_COLORS.UNSET).toBeNull();
  });
});
