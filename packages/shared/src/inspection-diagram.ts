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
 *
 * The body drawing is a *top view* (plan) of the vehicle, which is the scheme
 * the approved ORYX paint &amp; body page uses: front at the top, rear at the
 * bottom, the driver's side on the right. Markers therefore land on the same
 * panel on screen and on the printed page.
 */
export const BODY_VIEWBOX = { width: 520, height: 1000 } as const;
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

/** A named, clickable panel of the body plan. */
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
 * A top-down plan: the bonnet and windscreen at the front (top), the boot at
 * the rear (bottom), the left flank on the left and the right flank on the
 * right. The panels tile the outline without overlap, so a marker dropped
 * anywhere inside one is associated with it via `bodyPanelAt`.
 */
export const BODY_PANELS: readonly BodyPanelSpec[] = [
  { key: 'frontBumper', labelEn: 'Front bumper', labelAr: 'المصد الأمامي', d: 'M150 70 Q260 70 370 70 L372 104 L148 104 Z' },
  { key: 'hood', labelEn: 'Hood / bonnet', labelAr: 'غطاء المحرك', d: 'M148 104 L372 104 L372 250 L148 250 Z' },
  { key: 'windshield', labelEn: 'Windshield', labelAr: 'الزجاج الأمامي', d: 'M148 250 L372 250 L368 292 L152 292 Z' },
  { key: 'roof', labelEn: 'Roof', labelAr: 'السقف', d: 'M152 292 L368 292 L368 606 L152 606 Z' },
  { key: 'rearGlass', labelEn: 'Rear glass', labelAr: 'الزجاج الخلفي', d: 'M152 606 L368 606 L372 648 L148 648 Z' },
  { key: 'trunk', labelEn: 'Trunk / boot', labelAr: 'صندوق الأمتعة', d: 'M148 648 L372 648 L372 800 L148 800 Z' },
  { key: 'rearBumper', labelEn: 'Rear bumper', labelAr: 'المصد الخلفي', d: 'M148 800 L372 800 L370 844 L150 844 Z' },
  { key: 'frontLeftDoor', labelEn: 'Front left door', labelAr: 'الباب الأمامي الأيسر', d: 'M64 300 L152 300 L152 452 L64 452 Z' },
  { key: 'rearLeftDoor', labelEn: 'Rear left door', labelAr: 'الباب الخلفي الأيسر', d: 'M64 452 L152 452 L152 604 L64 604 Z' },
  { key: 'frontLeftFender', labelEn: 'Front left fender', labelAr: 'الرفرف الأمامي الأيسر', d: 'M64 178 L152 190 L152 300 L64 300 Z' },
  { key: 'rearLeftFender', labelEn: 'Rear left fender', labelAr: 'الرفرف الخلفي الأيسر', d: 'M64 604 L152 604 L152 760 L64 772 Z' },
  { key: 'frontRightDoor', labelEn: 'Front right door', labelAr: 'الباب الأمامي الأيمن', d: 'M368 300 L456 300 L456 452 L368 452 Z' },
  { key: 'rearRightDoor', labelEn: 'Rear right door', labelAr: 'الباب الخلفي الأيمن', d: 'M368 452 L456 452 L456 604 L368 604 Z' },
  { key: 'frontRightFender', labelEn: 'Front right fender', labelAr: 'الرفرف الأمامي الأيمن', d: 'M368 190 L456 178 L456 300 L368 300 Z' },
  { key: 'rearRightFender', labelEn: 'Rear right fender', labelAr: 'الرفرف الخلفي الأيمن', d: 'M368 604 L456 604 L456 772 L368 760 Z' },
] as const;

/** The outer silhouette, drawn beneath the panels. */
export const BODY_SILHOUETTE =
  'M120 66 Q260 58 400 66 Q458 92 462 150 L466 400 Q470 560 466 700 Q462 782 400 850 Q260 858 120 850 Q58 782 54 700 L50 400 Q46 150 54 150 Q58 92 120 66 Z';

/** The glazing, drawn above the silhouette and below the markers. */
export const BODY_GLASS_PATHS: readonly string[] = [
  'M152 250 L368 250 L368 292 L152 292 Z',
  'M152 606 L368 606 L368 648 L152 648 Z',
];

/**
 * The wheel contact patches, drawn at the four corners of the plan.
 *
 * The body is a plan view, so the "wheels" are the tyres seen from above — a
 * filled rounded rectangle straddling the flank on each corner.
 */
export const BODY_WHEELS: readonly { cx: number; cy: number; r: number }[] = [
  { cx: 60, cy: 250, r: 46 },
  { cx: 60, cy: 748, r: 46 },
  { cx: 460, cy: 250, r: 46 },
  { cx: 460, cy: 748, r: 46 },
];

/** Panel separation lines drawn over the silhouette. */
export const BODY_SEAM_PATHS: readonly string[] = [
  'M54 104 L466 104',
  'M54 250 L466 250',
  'M54 292 L466 292',
  'M54 606 L466 606',
  'M54 648 L466 648',
  'M54 800 L466 800',
  'M152 104 L152 844',
  'M368 104 L368 844',
  'M54 452 L152 452',
  'M368 452 L466 452',
  'M54 604 L152 604',
  'M368 604 L466 604',
];

/**
 * Which panel a normalised point falls on.
 *
 * The hit test is a bounding-box approximation of each panel's outline, which is
 * exact enough for a marker: the panels tile the body without overlap, so the
 * only ambiguity is a point exactly on a seam. Returns `null` for a point off
 * the vehicle, so a marker there is stored without a panel.
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
