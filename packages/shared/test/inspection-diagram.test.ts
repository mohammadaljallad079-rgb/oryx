import { describe, expect, it } from 'vitest';
import {
  BODY_PANELS,
  BODY_VIEWBOX,
  BODY_WHEELS,
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

describe('inspection diagram geometry — chassis regions', () => {
  it('declares a normalised position on the artwork for every catalogue region', () => {
    // The chassis drawing is the approved ORYX artwork, not a reconstructed
    // path set, so the contract that matters is that every assessed region has a
    // position on that artwork inside the 0–1 normalisation box.
    expect(CHASSIS_REGIONS.length).toBe(8);
    for (const region of CHASSIS_REGIONS) {
      expect(region.x).toBeGreaterThan(0);
      expect(region.x).toBeLessThan(1);
      expect(region.y).toBeGreaterThan(0);
      expect(region.y).toBeLessThan(1);
    }
  });

  it('gives every region a distinct position and both labels', () => {
    const spots = CHASSIS_REGIONS.map((r) => `${r.x},${r.y}`);
    expect(new Set(spots).size).toBe(spots.length);
    for (const region of CHASSIS_REGIONS) {
      expect(region.labelEn.trim()).not.toBe('');
      expect(region.labelAr.trim()).not.toBe('');
    }
  });

  it('places every region marker on the drawn body of the approved artwork', () => {
    // A hotspot that floats on empty paper is invisible in the report. The
    // approved chassis drawing keeps its structure inside this band, so every
    // normalised marker must fall within it to sit on the vehicle.
    for (const region of CHASSIS_REGIONS) {
      expect(region.x).toBeGreaterThanOrEqual(0.25);
      expect(region.x).toBeLessThanOrEqual(0.76);
      expect(region.y).toBeGreaterThanOrEqual(0.1);
      expect(region.y).toBeLessThanOrEqual(0.92);
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
