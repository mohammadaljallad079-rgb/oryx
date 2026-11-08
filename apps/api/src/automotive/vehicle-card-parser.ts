/**
 * Parser for Bahraini vehicle registration cards ("ملكية السيارة").
 *
 * The OCR layer produces a blob of text with Arabic and English mixed on each
 * line. This parser is deliberately pure so it can be unit-tested against real
 * OCR output without spinning up the engine. It only ever reports values it can
 * actually find: anything it cannot read is returned as `null` and listed in
 * `uncertain`, and the caller is expected to have a human confirm every field
 * before saving.
 */

export interface RegistrationCardFields {
  plateNumber: string | null;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  color: string | null;
  vin: string | null;
}

export type RegistrationCardField = keyof RegistrationCardFields;

export interface RegistrationCardParse {
  fields: RegistrationCardFields;
  /** Fields the parser could not read confidently. */
  uncertain: RegistrationCardField[];
  /** The raw text, for the review screen. */
  rawText: string;
}

/** Makes commonly seen on Bahraini roads, longest first so "Range Rover" wins. */
const MAKES = [
  'Mercedes-Benz',
  'Mercedes',
  'Range Rover',
  'Land Rover',
  'Rolls-Royce',
  'Volkswagen',
  'Chevrolet',
  'Mitsubishi',
  'Infiniti',
  'Porsche',
  'Hyundai',
  'Toyota',
  'Nissan',
  'Lexus',
  'Honda',
  'Suzuki',
  'Mazda',
  'Isuzu',
  'Jaguar',
  'Dodge',
  'Volvo',
  'Audi',
  'Ford',
  'Kia',
  'BMW',
  'GMC',
  'Jeep',
  'MG',
  'Geely',
  'Chery',
  'Haval',
  'Changan',
  'Renault',
  'Peugeot',
  'Tesla',
  'Mini',
  'Seat',
  'Skoda',
  'Fiat',
];

const COLORS = [
  'Pearl White',
  'White',
  'Black',
  'Silver',
  'Grey',
  'Gray',
  'Red',
  'Blue',
  'Green',
  'Beige',
  'Brown',
  'Gold',
  'Orange',
  'Yellow',
  'Maroon',
  'Bronze',
  'Purple',
  'Champagne',
];

/** Label anchors, English and Arabic, for each field. */
const LABELS: Record<RegistrationCardField, { en: string[]; ar: string[] }> = {
  plateNumber: { en: ['PLATE NO', 'PLATE NUMBER', 'PLATE'], ar: ['رقم اللوحة', 'اللوحة'] },
  make: { en: ['MAKE', 'MAKER'], ar: ['الشركة المصنعة', 'الماركة', 'الصانع'] },
  model: { en: ['MODEL'], ar: ['الطراز', 'الموديل'] },
  modelYear: { en: ['YEAR', 'MODEL YEAR'], ar: ['سنة الصنع', 'سنة'] },
  color: { en: ['COLOR', 'COLOUR'], ar: ['اللون'] },
  vin: { en: ['VIN', 'CHASSIS', 'CHASSIS NO', 'VIN NUMBER'], ar: ['رقم الشاصي', 'الشاصي', 'الهيكل'] },
};

/** Map Arabic-Indic and extended Arabic-Indic digits to ASCII. */
function normalizeDigits(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function collapse(value: string): string {
  // Strip bidi control marks that OCR emits around Arabic runs, so a value does
  // not carry invisible characters into the form.
  return value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
}

/** True when the character is an Arabic letter or diacritic. */
function isArabic(ch: string): boolean {
  return /[\u0600-\u06ff]/.test(ch);
}

/**
 * Pull the value that sits beside a label.
 *
 * Cards are laid out either `LABEL value` (English column) or `value ARABIC`
 * (Arabic column), so the value is whatever remains once the label and any
 * Arabic text are removed.
 */
function valueForLabel(line: string, field: RegistrationCardField): string | null {
  const upper = line.toUpperCase();
  for (const en of LABELS[field].en) {
    const idx = upper.indexOf(en);
    if (idx >= 0) {
      const after = line.slice(idx + en.length);
      const latin = after.split('').findIndex((ch) => isArabic(ch));
      const candidate = collapse(latin >= 0 ? after.slice(0, latin) : after).replace(/^[:.\-–]\s*/, '');
      if (candidate) return candidate;
    }
  }
  for (const ar of LABELS[field].ar) {
    const idx = line.indexOf(ar);
    if (idx >= 0) {
      const before = line.slice(0, idx);
      const candidate = collapse(before).replace(/[:.\-–]\s*$/, '');
      if (candidate) return candidate;
    }
  }
  return null;
}

/** Extract a company-unique-looking VIN from free text. */
function findVin(text: string): string | null {
  const strict = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/);
  if (strict) return strict[0];
  const loose = text.match(/\b[A-HJ-NPR-Z0-9]{11,16}\b/);
  if (loose) return loose[0];
  return null;
}

/** Extract a Bahraini plate number (digits, optionally with up to three letters). */
function findPlate(text: string): string | null {
  const patterns = [
    /\b\d{1,6}\s?[A-Z]{1,3}\b/,
    /\b[A-Z]{1,3}\s?\d{1,6}\b/,
    /\b\d{2,6}\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && isPlausiblePlate(match[0])) return collapse(match[0]);
  }
  return null;
}

/** A bare four-digit year (1900–2099) is a year, not a plate. */
function isPlausiblePlate(value: string): boolean {
  const compact = value.replace(/\s/g, '').toUpperCase();
  if (/^\d{4}$/.test(compact)) {
    const n = Number(compact);
    if (n >= 1900 && n <= 2099) return false;
  }
  return true;
}

function findMake(text: string): string | null {
  const upper = text.toUpperCase();
  for (const make of MAKES) {
    const re = new RegExp(`\\b${make.toUpperCase().replace(/[-]/g, '[- ]')}\\b`);
    if (re.test(upper)) return make;
  }
  return null;
}

function findColor(text: string): string | null {
  const upper = text.toUpperCase();
  for (const color of COLORS) {
    if (new RegExp(`\\b${color.toUpperCase()}\\b`).test(upper)) return color;
  }
  return null;
}

function findYear(text: string): number | null {
  const match = text.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  return match ? Number(match[1]) : null;
}

/**
 * Parse registration-card text into fields.
 *
 * Labels win over loose patterns: a value read next to its label is far more
 * reliable than a bare pattern match, so we try labels first and only fall back
 * to pattern search when the label is absent or unreadable.
 */
export function parseRegistrationCard(rawText: string): RegistrationCardParse {
  const text = normalizeDigits(rawText).replace(/\r/g, '');
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const labelled: Partial<Record<RegistrationCardField, string>> = {};
  for (const field of Object.keys(LABELS) as RegistrationCardField[]) {
    for (const line of lines) {
      const value = valueForLabel(line, field);
      if (value) {
        labelled[field] = value;
        break;
      }
    }
  }

  const flat = collapse(text);

  const plateNumber = cleanPlate(labelled.plateNumber) ?? findPlate(flat);
  const vin = cleanVin(labelled.vin) ?? findVin(flat);
  const make = labelled.make ? findMake(labelled.make) ?? titleCase(labelled.make) : findMake(flat);
  const model = labelled.model ? cleanModel(labelled.model) : null;
  const modelYear = labelled.modelYear ? findYear(labelled.modelYear) : findYear(flat);
  const color = labelled.color ? findColor(labelled.color) ?? titleCase(labelled.color) : findColor(flat);

  const fields: RegistrationCardFields = { plateNumber, make, model, modelYear, color, vin };
  const uncertain = (Object.keys(fields) as RegistrationCardField[]).filter((k) => fields[k] === null);

  return { fields, uncertain, rawText: rawText.trim() };
}

function cleanPlate(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = collapse(value).toUpperCase().replace(/[^A-Z0-9 ]/g, '');
  if (!/[0-9]/.test(candidate)) return null;
  if (!isPlausiblePlate(candidate)) return null;
  return candidate;
}

function cleanVin(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = collapse(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-HJ-NPR-Z0-9]{11,17}$/.test(candidate) ? candidate : null;
}

function cleanModel(value: string): string | null {
  const candidate = collapse(value).replace(/[^A-Za-z0-9 .\-]/g, '').trim();
  return candidate.length >= 1 ? candidate : null;
}

function titleCase(value: string): string | null {
  const cleaned = collapse(value).replace(/[^A-Za-z .\-]/g, '').trim();
  if (!cleaned) return null;
  return cleaned
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
