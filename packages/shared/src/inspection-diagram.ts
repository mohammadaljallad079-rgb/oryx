/**
 * The ORYX inspection diagram geometry.
 *
 * This module is the single source of truth for the *shape* of the two
 * interactive inspection drawings — the body-panel diagnostic scheme and the
 * eight-zone chassis safety diagram. The admin form and the official PDF
 * template both render from this file, so a marker the inspector places on
 * screen lands on the same panel of the same drawing in the printed report.
 *
 * The geometry is expressed as SVG path data in a fixed viewBox, not as an
 * image. Three reasons:
 *
 *   1. There is no authentic ORYX diagram artwork in the repository. Every
 *      asset that exists is a generic vector tile or a photograph, so an
 *      original drawing had to be reconstructed. Keeping it as vectors makes
 *      that provenance explicit and reviewable rather than hiding it inside an
 *      opaque raster.
 *   2. A raster would not let the report place a marker on a named panel at
 *      print resolution; a path can carry a `panelKey`, so a marker stores which
 *      panel it sits on as well as where.
 *   3. Vector art stays crisp at any page size and cannot fail to load in the
 *      PDF renderer.
 *
 * The drawing is a neutral technical elevation, not a brand mark and not stock
 * imagery. It is drawn once here and reused everywhere, which is the invariant
 * that matters: admin and PDF can never drift onto two different vehicles.
 *
 * This is a *provisional* reconstruction. If the original ORYX illustration is
 * recovered, replace the path data below; every consumer follows automatically.
 */

import type { ChassisRegionKey } from './inspection';

/** The drawing identity stored alongside each marker. */
export const BODY_DIAGRAM_ID = 'oryx-original-body';
export const CHASSIS_DIAGRAM_ID = 'oryx-original-chassis';

/**
 * The fixed coordinate box both drawings are authored in. Marker coordinates
 * are normalised to 0–1 of this box, so a marker is independent of screen size,
 * zoom, device orientation and text direction.
 */
export const BODY_VIEWBOX = { width: 1000, height: 420 } as const;
export const CHASSIS_VIEWBOX = { width: 420, height: 720 } as const;

/**
 * The marker colours.
 *
 * These are the technical inspection indicators and are deliberately *not*
 * theme tokens: a green paint dot must read green on a light form, a dark form
 * and the printed page alike. The report and the screen both read these values,
 * so the legend, the toolbar and the printed marker cannot disagree.
 */
export const INSPECTION_MARKER_COLORS = {
  green: '#1f9d55',
  orange: '#e08a1e',
  red: '#d92d20',
} as const;

export type InspectionMarkerColor = keyof typeof INSPECTION_MARKER_COLORS;

/** A named, clickable panel of the body elevation. */
export interface BodyPanelSpec {
  /** Stable key stored on a marker; never renumber an existing key. */
  key: string;
  labelEn: string;
  labelAr: string;
  /** SVG path data for the panel outline, in `BODY_VIEWBOX` units. */
  d: string;
}

/**
 * The body-panel diagnostic scheme.
 *
 * A left-to-right side elevation: front (nose) on the left, rear on the right,
 * which is the conventional reading of a paint-thickness inspection sheet. The
 * panels are the ones the report names; a marker dropped anywhere inside one is
 * associated with it via `bodyPanelAt`.
 */
export const BODY_PANELS: readonly BodyPanelSpec[] = [
  { key: 'frontBumper', labelEn: 'Front bumper', labelAr: 'المصد الأمامي', d: 'M52 300 L52 258 Q52 238 74 231 L150 216 L150 300 Z' },
  { key: 'hood', labelEn: 'Hood / bonnet', labelAr: 'غطاء المحرك', d: 'M150 216 L300 172 Q330 160 372 158 L372 300 L150 300 Z' },
  { key: 'frontFender', labelEn: 'Front fender', labelAr: 'الرفرف الأمامي', d: 'M300 172 L372 158 L372 214 L300 214 Z' },
  { key: 'frontDoor', labelEn: 'Front door', labelAr: 'الباب الأمامي', d: 'M372 214 L500 214 L500 300 L372 300 Z' },
  { key: 'rearDoor', labelEn: 'Rear door', labelAr: 'الباب الخلفي', d: 'M500 214 L628 214 L628 300 L500 300 Z' },
  { key: 'rearFender', labelEn: 'Rear fender', labelAr: 'الرفرف الخلفي', d: 'M628 214 L700 218 L760 234 L760 300 L628 300 Z' },
  { key: 'trunk', labelEn: 'Trunk / boot', labelAr: 'صندوق الأمتعة', d: 'M760 234 L860 244 Q920 252 928 272 L928 300 L760 300 Z' },
  { key: 'roof', labelEn: 'Roof', labelAr: 'السقف', d: 'M400 158 L640 158 Q664 158 688 178 L700 214 L372 214 Q372 176 400 158 Z' },
  { key: 'rearBumper', labelEn: 'Rear bumper', labelAr: 'المصد الخلفي', d: 'M928 272 L948 276 Q958 284 958 296 L958 300 L928 300 Z' },
] as const;

/** The outer silhouette, drawn beneath the panels. */
export const BODY_SILHOUETTE =
  'M52 300 L52 258 Q52 236 76 229 L300 172 Q332 158 376 158 L640 158 Q666 158 690 178 L842 224 Q932 236 948 254 Q958 266 958 286 L958 300 Q958 322 936 322 L74 322 Q52 322 52 300 Z';

/** The glazing, drawn above the silhouette and below the markers. */
export const BODY_GLASS_PATHS: readonly string[] = [
  'M398 168 Q420 162 452 162 L498 162 L498 208 L376 208 Q376 182 398 168 Z',
  'M512 162 L640 162 Q666 162 682 178 L698 208 L512 208 Z',
];

/** The wheel positions (centre x, centre y, radius) in viewBox units. */
export const BODY_WHEELS: readonly { cx: number; cy: number; r: number }[] = [
  { cx: 250, cy: 322, r: 62 },
  { cx: 762, cy: 322, r: 62 },
];

/** Panel separation lines drawn over the silhouette. */
export const BODY_SEAM_PATHS: readonly string[] = [
  'M150 216 L150 322',
  'M372 158 L372 322',
  'M500 214 L500 322',
  'M628 214 L628 322',
  'M760 234 L760 322',
];

/**
 * Which panel a normalised point falls on.
 *
 * The hit test is a bounding-box approximation of each panel's outline, which is
 * exact enough for a marker: the panels tile the body without overlap, so the
 * only ambiguity is a point exactly on a seam. Returns `null` for a point off
 * the vehicle (sky or ground), so a marker there is stored without a panel.
 */
export function bodyPanelAt(x: number, y: number): BodyPanelSpec | null {
  const px = x * BODY_VIEWBOX.width;
  const py = y * BODY_VIEWBOX.height;
  // Smallest-area match wins, so a small panel (a fender) is not shadowed by the
  // larger box that encloses it.
  let best: BodyPanelSpec | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const panel of BODY_PANELS) {
    const box = pathBounds(panel.d);
    if (px < box.x1 || px > box.x2 || py < box.y1 || py > box.y2) continue;
    const area = (box.x2 - box.x1) * (box.y2 - box.y1);
    if (area < bestArea) {
      bestArea = area;
      best = panel;
    }
  }
  return best;
}

/** The axis-aligned bounds of a path, from its absolute `M`/`L` coordinates. */
function pathBounds(d: string): { x1: number; y1: number; x2: number; y2: number } {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  let x1 = Number.POSITIVE_INFINITY;
  let y1 = Number.POSITIVE_INFINITY;
  let x2 = Number.NEGATIVE_INFINITY;
  let y2 = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    if (x < x1) x1 = x;
    if (y < y1) y1 = y;
    if (x > x2) x2 = x;
    if (y > y2) y2 = y;
  }
  return { x1, y1, x2, y2 };
}

/** A chassis zone hotspot: an SVG path in `CHASSIS_VIEWBOX` units. */
export interface ChassisZoneSpec {
  /** Must match a key in `CHASSIS_REGIONS` in `inspection.ts`. */
  key: ChassisRegionKey;
  /** SVG path data for the zone, drawn filled and clickable. */
  d: string;
  /** Where the zone's number badge sits, in viewBox units. */
  labelX: number;
  labelY: number;
}

/**
 * The chassis outline: a plan view of the underbody, front at the top.
 *
 * The outline and the longitudinal rails are drawn once; the eight zones tile
 * the floor plan on top of them. The numbering runs front-centre, then down the
 * left rail, up the right rail and across the rear — the order the report's own
 * checklist uses.
 */
export const CHASSIS_OUTLINE =
  'M210 26 Q306 26 344 78 Q366 128 366 200 L366 520 Q366 592 344 642 Q306 694 210 694 Q114 694 76 642 Q54 592 54 520 L54 200 Q54 128 76 78 Q114 26 210 26 Z';

/** The structural rails and cross-members drawn under the zones. */
export const CHASSIS_STRUCTURE_PATHS: readonly string[] = [
  'M120 150 L300 150',
  'M120 570 L300 570',
  'M210 40 L210 680',
];

/**
 * The eight assessed zones, in the report's reading order.
 *
 * Each zone is a band of the floor plan. They tile the outline without overlap,
 * so clicking anywhere on the chassis selects exactly one zone.
 */
export const CHASSIS_ZONES: readonly ChassisZoneSpec[] = [
  { key: 'FRONT', d: 'M210 26 Q306 26 344 78 L344 150 L76 150 L76 78 Q114 26 210 26 Z', labelX: 210, labelY: 96 },
  { key: 'FRONT_LEFT', d: 'M76 150 L210 150 L210 290 L76 290 Z', labelX: 143, labelY: 226 },
  { key: 'FRONT_RIGHT', d: 'M210 150 L344 150 L344 290 L210 290 Z', labelX: 277, labelY: 226 },
  { key: 'MIDDLE_LEFT', d: 'M76 290 L210 290 L210 430 L76 430 Z', labelX: 143, labelY: 366 },
  { key: 'MIDDLE_RIGHT', d: 'M210 290 L344 290 L344 430 L210 430 Z', labelX: 277, labelY: 366 },
  { key: 'REAR_LEFT', d: 'M76 430 L210 430 L210 570 L76 570 Z', labelX: 143, labelY: 506 },
  { key: 'REAR_RIGHT', d: 'M210 430 L344 430 L344 570 L210 570 Z', labelX: 277, labelY: 506 },
  { key: 'REAR', d: 'M76 570 L344 570 L344 642 Q306 694 210 694 Q114 694 76 642 Z', labelX: 210, labelY: 636 },
] as const;

/** The chassis-zone colour by condition, shared by screen and report. */
export const CHASSIS_ZONE_COLORS = {
  OK: INSPECTION_MARKER_COLORS.green,
  DAMAGE: INSPECTION_MARKER_COLORS.red,
  UNSET: null,
} as const;
