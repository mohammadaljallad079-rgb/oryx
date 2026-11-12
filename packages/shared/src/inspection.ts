/**
 * The ORYX vehicle-inspection specification.
 *
 * This module is the single source of truth for *what* an inspection contains:
 * the seven selectable inspection areas, every item inside them with its Arabic
 * and English label, the four paint/body conditions, the eight chassis safety
 * regions and the allowed result values. The API validates against it, the admin
 * interface renders from it and a test asserts the section/item counts, so a
 * screen and the server can never disagree about the checklist.
 *
 * The values are transcribed from the ORYX Vehicle Inspection Report. Nothing
 * here is invented, and no item may be dropped: the counts in
 * `INSPECTION_SECTION_SPECS` are asserted by `inspection.test.ts`.
 *
 * A section is selected as a whole. Selecting `PAINT_BODY` must not require any
 * other area, which is why the areas are independent top-level keys rather than
 * one monolithic form.
 */

/** The seven data areas an inspection can record results against. These are the
 * storage/editor granularity and are *not* what the operator selects: the
 * approved report offers four selectable inspection types, each of which covers
 * one or more of these areas (see `INSPECTION_TYPES`). */
export const INSPECTION_SECTION_KEYS = [
  'PAINT_BODY',
  'CHASSIS_UNDERCARRIAGE',
  'INTERIOR',
  'EXTERIOR',
  'ENGINE_COMPARTMENT',
  'ROAD_TEST',
  'COMPUTER_UNIT',
] as const;

export type InspectionSectionKey = (typeof INSPECTION_SECTION_KEYS)[number];

/**
 * The four selectable inspection types of the approved report.
 *
 * The report has exactly four check sections, so the operator chooses one or
 * more of these — never the seven internal areas. Each type maps to the areas
 * that record its results, which is why selecting a type expands to its areas
 * for storage while the screen and the printed plan stay at four.
 */
export const INSPECTION_TYPE_KEYS = [
  'PAINT_BODY',
  'CHASSIS_UNDERCARRIAGE',
  'CABIN_AND_MECHANICAL',
  'COMPUTER_UNIT',
] as const;

export type InspectionTypeKey = (typeof INSPECTION_TYPE_KEYS)[number];

export interface InspectionTypeSpec {
  key: InspectionTypeKey;
  labelEn: string;
  labelAr: string;
  summaryEn: string;
  summaryAr: string;
  /** The printed page of the report this type is drawn on. */
  page: number;
  /** The data areas this type records results against. */
  sections: readonly InspectionSectionKey[];
}

export const INSPECTION_TYPES: readonly InspectionTypeSpec[] = [
  {
    key: 'PAINT_BODY',
    labelEn: 'Vehicle Paint & Body Check',
    labelAr: 'فحص الصبغ وبدن المركبة',
    summaryEn: 'Body panels diagnostic scheme and paint remarks.',
    summaryAr: 'مخطط تشخيص هياكل السيارة وملاحظات الصبغ.',
    page: 2,
    sections: ['PAINT_BODY'],
  },
  {
    key: 'CHASSIS_UNDERCARRIAGE',
    labelEn: 'Chassis & Undercarriage Condition',
    labelAr: 'فحص الشاصي وأسفل المركبة',
    summaryEn: 'Chassis safety diagram with eight assessed regions.',
    summaryAr: 'مخطط سلامة الشاصي بثماني مناطق تقييم.',
    page: 3,
    sections: ['CHASSIS_UNDERCARRIAGE'],
  },
  {
    key: 'CABIN_AND_MECHANICAL',
    labelEn: 'Interior & Exterior / Engine Compartment / Road Test',
    labelAr: 'الفحص الداخلي والخارجي / مقصورة المحرك / تجربة القيادة',
    summaryEn: 'Cabin, exterior, engine compartment and road test checklists.',
    summaryAr: 'قوائم الفحص الداخلي والخارجي ومقصورة المحرك وتجربة القيادة.',
    page: 4,
    sections: ['INTERIOR', 'EXTERIOR', 'ENGINE_COMPARTMENT', 'ROAD_TEST'],
  },
  {
    key: 'COMPUTER_UNIT',
    labelEn: 'Computer Unit Inspection',
    labelAr: 'فحص وحدة الكمبيوتر',
    summaryEn: 'Computer module faults and an optional vendor diagnostic PDF.',
    summaryAr: 'أعطال وحدة الكمبيوتر وملف تشخيص PDF الخارجي الاختياري.',
    page: 5,
    sections: ['COMPUTER_UNIT'],
  },
] as const;

export function inspectionTypeSpec(key: string): InspectionTypeSpec {
  const found = INSPECTION_TYPES.find((t) => t.key === key);
  if (!found) throw new Error(`Unknown inspection type: ${key}`);
  return found;
}

export function isInspectionTypeKey(key: string): key is InspectionTypeKey {
  return (INSPECTION_TYPE_KEYS as readonly string[]).includes(key);
}

/** The data areas a type records, in catalogue order. */
export function sectionsForType(key: InspectionTypeKey): InspectionSectionKey[] {
  const spec = inspectionTypeSpec(key);
  return INSPECTION_SECTION_KEYS.filter((k) => spec.sections.includes(k));
}

/** Expand a set of selected types into the areas they record, deduped and in
 * catalogue order. This is what the API stores on `selectedAreas`. */
export function areasForTypes(types: readonly InspectionTypeKey[]): InspectionSectionKey[] {
  const wanted = new Set<InspectionSectionKey>();
  for (const type of types) for (const area of sectionsForType(type)) wanted.add(area);
  return INSPECTION_SECTION_KEYS.filter((k) => wanted.has(k));
}

/** The type that owns a stored area. */
export function typeForSection(area: InspectionSectionKey): InspectionTypeKey {
  const found = INSPECTION_TYPES.find((t) => t.sections.includes(area));
  if (!found) throw new Error(`No inspection type owns area ${area}`);
  return found.key;
}

/** The distinct types a set of stored areas maps back to, in catalogue order.
 * The inverse of `areasForTypes`, used to show the operator the four types a
 * job covers. */
export function typesForAreas(areas: readonly InspectionSectionKey[]): InspectionTypeKey[] {
  const wanted = new Set<InspectionTypeKey>();
  for (const area of areas) wanted.add(typeForSection(area));
  return INSPECTION_TYPE_KEYS.filter((k) => wanted.has(k));
}

/**
 * How a section is completed. `ITEMS` is a checklist, `DIAGRAM_PAINT` and
 * `DIAGRAM_CHASSIS` are interactive diagrams, `DIAGNOSTIC` is free-form fault
 * entry. The interface uses this to pick the right editor.
 */
export type InspectionSectionKind = 'ITEMS' | 'DIAGRAM_PAINT' | 'DIAGRAM_CHASSIS' | 'DIAGNOSTIC';

/** Which printed page of the report a section comes from, so the official
 * document can be regrouped in Phase 3 without changing the data model.
 *
 * The mapping follows the approved ORYX inspection report:
 *   page 1 — identification, vehicle photograph, terms and signatures;
 *   page 2 — paint &amp; body (top-view panel diagram);
 *   page 3 — chassis &amp; undercarriage (underbody diagram);
 *   page 4 — interior &amp; exterior, engine compartment and road test;
 *   page 5 — computer unit inspection.
 */
export const INSPECTION_SECTION_PAGE: Record<InspectionSectionKey, number> = {
  PAINT_BODY: 2,
  CHASSIS_UNDERCARRIAGE: 3,
  INTERIOR: 4,
  EXTERIOR: 4,
  ENGINE_COMPARTMENT: 4,
  ROAD_TEST: 4,
  COMPUTER_UNIT: 5,
};

/** A recorded result. `UNSET` means "not yet inspected" and is never silently
 * upgraded to a pass — an inspector must choose. */
export type InspectionItemResult = 'PASS' | 'FAIL' | 'NA' | 'UNSET';

/** The result vocabulary an item accepts. */
export type InspectionResultSet = 'PASS_FAIL' | 'PASS_FAIL_NA';

export interface InspectionItemSpec {
  /** Stable key, stored on the result row. Never renumber an existing key. */
  key: string;
  labelEn: string;
  labelAr: string;
}

export interface InspectionSectionSpec {
  key: InspectionSectionKey;
  labelEn: string;
  labelAr: string;
  /** One-line description shown on the selection screen. */
  summaryEn: string;
  summaryAr: string;
  page: number;
  kind: InspectionSectionKind;
  /** The results an item in this section accepts. */
  resultSet: InspectionResultSet;
  items: readonly InspectionItemSpec[];
  remarksLabelEn: string;
  remarksLabelAr: string;
}

/** Pass/Fail, used where a third "not applicable" state would be meaningless. */
const PASS_FAIL: InspectionResultSet = 'PASS_FAIL';
const PASS_FAIL_NA: InspectionResultSet = 'PASS_FAIL_NA';

/**
 * The complete section catalogue.
 *
 * Item order matches the printed report. The English and Arabic labels are the
 * report's own wording; do not paraphrase them.
 */
export const INSPECTION_SECTION_SPECS: readonly InspectionSectionSpec[] = [
  {
    key: 'PAINT_BODY',
    labelEn: 'Paint & Body',
    labelAr: 'الصبغ والهيكل',
    summaryEn: 'Body panels diagnostic scheme and paint remarks.',
    summaryAr: 'مخطط تشخيص هياكل السيارة وملاحظات الصبغ.',
    page: 2,
    kind: 'DIAGRAM_PAINT',
    resultSet: PASS_FAIL,
    items: [],
    remarksLabelEn: 'Paint & Body Technical Remarks',
    remarksLabelAr: 'الملاحظات الفنية للصبغ والهيكل',
  },
  {
    key: 'CHASSIS_UNDERCARRIAGE',
    labelEn: 'Chassis & Undercarriage',
    labelAr: 'الشاسيه والأسفل',
    summaryEn: 'Chassis safety diagram with eight assessed regions.',
    summaryAr: 'مخطط سلامة الشاسيه بثماني مناطق تقييم.',
    page: 3,
    kind: 'DIAGRAM_CHASSIS',
    resultSet: PASS_FAIL,
    items: [],
    remarksLabelEn: 'Chassis Condition & Underbody Remarks',
    remarksLabelAr: 'ملاحظات حالة الشاسيه والأسفل',
  },
  {
    key: 'INTERIOR',
    labelEn: 'Interior Inspection',
    labelAr: 'الفحص الداخلي',
    summaryEn: 'Cabin, controls, comfort and interior fittings.',
    summaryAr: 'المقصورة وأدوات التحكم والراحة والتجهيزات الداخلية.',
    page: 4,
    kind: 'ITEMS',
    resultSet: PASS_FAIL_NA,
    items: [
      { key: 'interior.doors', labelEn: 'Driver & Passenger Doors', labelAr: 'أبواب السائق والركاب' },
      { key: 'interior.controlKeys', labelEn: 'Control Keys & Switches', labelAr: 'المفاتيح والمحابس' },
      { key: 'interior.clusterControl', labelEn: 'Cluster Control', labelAr: 'التحكم بالعدّاد' },
      { key: 'interior.cupHolder', labelEn: 'Cup Holder & Console', labelAr: 'حامل الأكواب والكونسول' },
      { key: 'interior.steeringWheel', labelEn: 'Steering Wheel & Controls', labelAr: 'المقود والتحكم' },
      { key: 'interior.audio', labelEn: 'Audio & Display System', labelAr: 'نظام الصوت والشاشة' },
      { key: 'interior.sunroof', labelEn: 'Sunroof Operation', labelAr: 'عمل فتحة السقف' },
      { key: 'interior.acVents', labelEn: 'A/C Vents & Airflow', labelAr: 'فتحات التكييف وتدفق الهواء' },
      { key: 'interior.rearViewMirror', labelEn: 'Rear View Mirror', labelAr: 'مرآة الرؤية الخلفية' },
      { key: 'interior.carpet', labelEn: 'Carpet & Floor Mats', labelAr: 'الفرش ودواسات الأرضية' },
      { key: 'interior.cigaretteLighter', labelEn: 'Cigarette Lighter & 12V', labelAr: 'الولاعة ومقبس 12 فولت' },
      { key: 'interior.otherParts', labelEn: 'Other Interior Parts', labelAr: 'أجزاء داخلية أخرى' },
    ],
    remarksLabelEn: 'Interior Inspection Remarks',
    remarksLabelAr: 'ملاحظات الفحص الداخلي',
  },
  {
    key: 'EXTERIOR',
    labelEn: 'Exterior Inspection',
    labelAr: 'الفحص الخارجي',
    summaryEn: 'Body glazing, lighting, wipers, mirrors and tyres.',
    summaryAr: 'الزجاج والإضاءة والمساحات والمرايا والإطارات.',
    page: 4,
    kind: 'ITEMS',
    resultSet: PASS_FAIL_NA,
    items: [
      { key: 'exterior.windows', labelEn: 'Windows & Windshield', labelAr: 'النوافذ والزجاج الأمامي' },
      { key: 'exterior.lights', labelEn: 'Head, Reverse & Fog Lights', labelAr: 'الأنوار الأمامية والخلفية وضباب' },
      { key: 'exterior.indicators', labelEn: 'Indicator Lights', labelAr: 'أنوار الإشارة' },
      { key: 'exterior.wipers', labelEn: 'Wipers & Spray Jets', labelAr: 'المساحات ومرشات الماء' },
      { key: 'exterior.mirrors', labelEn: 'Side Mirrors & Fold Mechanism', labelAr: 'المرايا الجانبية وآلية الطي' },
      { key: 'exterior.tiresRims', labelEn: 'Tires Condition & Rims', labelAr: 'حالة الإطارات والجنوط' },
    ],
    remarksLabelEn: 'Exterior Inspection Remarks',
    remarksLabelAr: 'ملاحظات الفحص الخارجي',
  },
  {
    key: 'ENGINE_COMPARTMENT',
    labelEn: 'Engine Compartment',
    labelAr: 'حجرة المحرك',
    summaryEn: 'Fluids, electrical, mechanical and intake systems.',
    summaryAr: 'السوائل والكهرباء والأنظمة الميكانيكية والسحب.',
    page: 4,
    kind: 'ITEMS',
    resultSet: PASS_FAIL,
    items: [
      { key: 'engine.fluids', labelEn: 'Fluids — Oil, Coolant, Brake', labelAr: 'السوائل — الزيت والمبرد والفرامل' },
      { key: 'engine.wiring', labelEn: 'Wiring & Connectors', labelAr: 'الأسلاك والموصلات' },
      { key: 'engine.hoses', labelEn: 'Hoses & Lines', labelAr: 'الخراطيم والخطوط' },
      { key: 'engine.fluidLeaks', labelEn: 'Fluid Leaks — Engine / Transmission', labelAr: 'تسريبات السوائل — المحرك / ناقل الحركة' },
      { key: 'engine.mounts', labelEn: 'Engine & Transmission Mounts', labelAr: 'كراسي المحرك وناقل الحركة' },
      { key: 'engine.caps', labelEn: 'Caps & Reservoir Covers', labelAr: 'الأغطية وأغطية الخزانات' },
      { key: 'engine.suspension', labelEn: 'Suspension System', labelAr: 'نظام التعليق' },
      { key: 'engine.rubberBoots', labelEn: 'Rubber Boots & Bushings', labelAr: 'الأكياس المطاطية والجلبات' },
      { key: 'engine.brakeSystem', labelEn: 'Brake System', labelAr: 'نظام الفرامل' },
      { key: 'engine.airbox', labelEn: 'Airbox & Intake Duct', labelAr: 'صندوق الهواء ومجرى السحب' },
      { key: 'engine.driveBelts', labelEn: 'Engine Drive Belts', labelAr: 'أحزمة تشغيل المحرك' },
      { key: 'engine.exhaustManifold', labelEn: 'Exhaust Manifold', labelAr: 'مانيفولد العادم' },
      { key: 'engine.battery', labelEn: 'Battery State of Health', labelAr: 'حالة صحة البطارية' },
    ],
    remarksLabelEn: 'Engine Compartment Remarks',
    remarksLabelAr: 'ملاحظات حجرة المحرك',
  },
  {
    key: 'ROAD_TEST',
    labelEn: 'Road Test',
    labelAr: 'اختبار الطريق',
    summaryEn: 'Road test drive observations recorded while driving.',
    summaryAr: 'ملاحظات اختبار القيادة على الطريق.',
    page: 4,
    kind: 'ITEMS',
    resultSet: PASS_FAIL,
    items: [
      { key: 'road.suspensionNoise', labelEn: 'Suspension Noise', labelAr: 'ضجيج نظام التعليق' },
      { key: 'road.rpmIdleStability', labelEn: 'RPM Idle Stability', labelAr: 'استقرار دوران المحرك على الوضع الحر' },
      { key: 'road.engineRunningNoise', labelEn: 'Engine Running Noise', labelAr: 'ضجيج تشغيل المحرك' },
      { key: 'road.vibrations', labelEn: 'Body & Drivetrain Vibrations', labelAr: 'اهتزازات الهيكل وناقل الحركة' },
      { key: 'road.brakingPerformance', labelEn: 'Braking Performance', labelAr: 'أداء الفرملة' },
      { key: 'road.steeringAlignment', labelEn: 'Steering Alignment & Center', labelAr: 'اتزان المقود وتمركزه' },
      { key: 'road.climateControl', labelEn: 'Climate Control System', labelAr: 'نظام التحكم بالمناخ' },
      { key: 'road.transmissionShifting', labelEn: 'Transmission Shifting', labelAr: 'تعشيق ناقل الحركة' },
      { key: 'road.clusterWarningLamps', labelEn: 'Cluster Warning Lamps', labelAr: 'أضواء التحذير في العدّاد' },
      { key: 'road.overallPerformance', labelEn: 'Overall Vehicle Performance', labelAr: 'الأداء العام للمركبة' },
      { key: 'road.exhaustSmoke', labelEn: 'Exhaust Smoke Emission', labelAr: 'انبعاث دخان العادم' },
      { key: 'road.tireRollingNoise', labelEn: 'Tire Rolling Noise', labelAr: 'ضجيج دحرجة الإطارات' },
      { key: 'road.windNoise', labelEn: 'Cabin Wind Noise & Sealing', labelAr: 'ضجيج الهواء وإحكام المقصورة' },
    ],
    remarksLabelEn: 'Road Test Remarks',
    remarksLabelAr: 'ملاحظات اختبار الطريق',
  },
  {
    key: 'COMPUTER_UNIT',
    labelEn: 'Computer Unit Inspection',
    labelAr: 'فحص وحدة الكمبيوتر',
    summaryEn: 'Computer module faults and diagnostic fault records.',
    summaryAr: 'أعطال وحدة الكمبيوتر وسجلات الأعطال التشخيصية.',
    page: 5,
    kind: 'DIAGNOSTIC',
    resultSet: PASS_FAIL,
    items: [],
    remarksLabelEn: 'Computer Unit Inspection Remarks',
    remarksLabelAr: 'ملاحظات فحص وحدة الكمبيوتر',
  },
] as const;

/** Lookup by key. Throws on an unknown key so a typo cannot silently create a
 * section with no checklist. */
export function inspectionSectionSpec(key: string): InspectionSectionSpec {
  const found = INSPECTION_SECTION_SPECS.find((s) => s.key === key);
  if (!found) throw new Error(`Unknown inspection section: ${key}`);
  return found;
}

export function isInspectionSectionKey(key: string): key is InspectionSectionKey {
  return (INSPECTION_SECTION_KEYS as readonly string[]).includes(key);
}

/** The results an item in a section accepts, as a concrete list. */
export function inspectionResultsFor(section: InspectionSectionSpec): InspectionItemResult[] {
  return section.resultSet === 'PASS_FAIL_NA' ? ['PASS', 'FAIL', 'NA'] : ['PASS', 'FAIL'];
}

/**
 * The four body-panel conditions of the diagnostic scheme.
 *
 * `marker` is the visual convention the report uses: paint is green, filler is
 * orange, and both a changed and a sectioned panel are red (a sectioned panel
 * additionally carries an X). The colour is data, not styling, so the diagram,
 * the legend and the printed report cannot drift apart.
 */
export interface PaintConditionSpec {
  key: PaintCondition;
  labelEn: string;
  labelAr: string;
  /** The marker colour name; the UI maps it to a CSS token. */
  color: 'green' | 'orange' | 'red';
  /** Whether the marker is drawn with a cross over it. */
  cross: boolean;
}

export type PaintCondition = 'PAINT' | 'FILLER' | 'CHANGE' | 'SECTIONED';

export const PAINT_CONDITIONS: readonly PaintConditionSpec[] = [
  { key: 'PAINT', labelEn: 'Paint', labelAr: 'صبغ / رش', color: 'green', cross: false },
  { key: 'FILLER', labelEn: 'Filler', labelAr: 'معجون', color: 'orange', cross: false },
  { key: 'CHANGE', labelEn: 'Change', labelAr: 'تبديل', color: 'red', cross: false },
  { key: 'SECTIONED', labelEn: 'Sectioned', labelAr: 'مقطوع', color: 'red', cross: true },
] as const;

export function paintConditionSpec(key: string): PaintConditionSpec {
  const found = PAINT_CONDITIONS.find((c) => c.key === key);
  if (!found) throw new Error(`Unknown paint condition: ${key}`);
  return found;
}

/**
 * The eight assessed regions of the chassis safety diagram.
 *
 * The order is the diagram's own reading order (front to rear), and the Arabic
 * names are the report's. A region is either sound or damaged; there is no
 * "not applicable" because every vehicle has a front, a rear and both sides.
 */
export type ChassisRegionKey =
  | 'FRONT'
  | 'FRONT_LEFT'
  | 'FRONT_RIGHT'
  | 'MIDDLE_LEFT'
  | 'MIDDLE_RIGHT'
  | 'REAR_LEFT'
  | 'REAR_RIGHT'
  | 'REAR';

export interface ChassisRegionSpec {
  key: ChassisRegionKey;
  labelEn: string;
  labelAr: string;
  /** Normalised position on the diagram, for the region hotspot. */
  x: number;
  y: number;
}

export const CHASSIS_REGIONS: readonly ChassisRegionSpec[] = [
  { key: 'FRONT', labelEn: 'Front', labelAr: 'أمامي', x: 0.5, y: 0.06 },
  { key: 'FRONT_LEFT', labelEn: 'Front Left', labelAr: 'أمامي يسار', x: 0.22, y: 0.2 },
  { key: 'FRONT_RIGHT', labelEn: 'Front Right', labelAr: 'أمامي يمين', x: 0.78, y: 0.2 },
  { key: 'MIDDLE_LEFT', labelEn: 'Middle Left', labelAr: 'وسط يسار', x: 0.2, y: 0.42 },
  { key: 'MIDDLE_RIGHT', labelEn: 'Middle Right', labelAr: 'وسط يمين', x: 0.8, y: 0.42 },
  { key: 'REAR_LEFT', labelEn: 'Rear Left', labelAr: 'خلفي يسار', x: 0.22, y: 0.68 },
  { key: 'REAR_RIGHT', labelEn: 'Rear Right', labelAr: 'خلفي يمين', x: 0.78, y: 0.68 },
  { key: 'REAR', labelEn: 'Rear', labelAr: 'خلفي', x: 0.5, y: 0.94 },
] as const;

export type ChassisRegionCondition = 'OK' | 'DAMAGE' | 'UNSET';

export function chassisRegionSpec(key: string): ChassisRegionSpec {
  const found = CHASSIS_REGIONS.find((r) => r.key === key);
  if (!found) throw new Error(`Unknown chassis region: ${key}`);
  return found;
}

/**
 * The identification header repeated at the top of every inspection section, so
 * one inspection identity is visible on every selected page.
 */
export interface InspectionIdentity {
  jobNumber: string;
  inspectedAt: string;
  make: string;
  model: string;
  modelYear: number;
  plateNumber: string | null;
  vin: string;
  odometer: number | null;
}

/** The lifecycle of an inspection. `DRAFT` and `IN_PROGRESS` are both editable
 * and both saveable while incomplete; only `PENDING_REVIEW` and beyond require
 * every mandatory item in the *selected* sections. */
export const INSPECTION_STATUSES = [
  'DRAFT',
  'IN_PROGRESS',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;

export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

/** Statuses in which the inspector may still edit results. */
export const INSPECTION_EDITABLE_STATUSES: readonly InspectionStatus[] = [
  'DRAFT',
  'IN_PROGRESS',
  'REJECTED',
];

export function isInspectionEditable(status: InspectionStatus): boolean {
  return INSPECTION_EDITABLE_STATUSES.includes(status);
}
