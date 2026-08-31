/**
 * Data Migration Center — transformation rule library (design doc §16-17).
 * Pure, synchronous functions only — no DB access here. Purity/design/
 * item-type resolution needs a live lookup against the target tenant's
 * (global) masters, so this layer only NORMALIZES a raw value into a
 * clean intermediate shape (e.g. "22K" -> { karat: 22, percentage: 91.6 })
 * — the entity migrator (a later batch) is what resolves that against
 * the real tbl_purity_master and turns it into a Purity_ID.
 */
const dayjs = require('dayjs');
dayjs.extend(require('dayjs/plugin/customParseFormat'));

const YES_VALUES = ['yes', 'y', 'true', '1', 'active', 'a'];
const NO_VALUES = ['no', 'n', 'false', '0', 'inactive', 'i'];

const DATE_FORMATS = ['YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MMM-YYYY', 'DD MMM YYYY'];

function toStringVal(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function toNumberVal(v) {
  if (v === null || v === undefined || v === '') return null;
  // Strip thousands separators/currency symbols a spreadsheet export commonly carries — "₹1,25,000" / "1,250.50".
  const cleaned = String(v).replace(/[₹$,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toBooleanVal(v, fallback = false) {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (YES_VALUES.includes(s)) return true;
  if (NO_VALUES.includes(s)) return false;
  return fallback;
}

function toDateISO(v) {
  if (!v) return null;
  const d = v instanceof Date ? dayjs(v) : dayjs(String(v), DATE_FORMATS, true);
  return d.isValid() ? d.format('YYYY-MM-DD') : null;
}

function normalizeGender(v) {
  const s = toStringVal(v).toLowerCase();
  if (['m', 'male'].includes(s)) return 'Male';
  if (['f', 'female'].includes(s)) return 'Female';
  if (['o', 'other'].includes(s)) return 'Other';
  return null;
}

// mg/g/kg -> grams, matching this schema's Gross_Weight/Net_Gold_Weight
// decimal(10,3) columns (3 decimal places = milligram precision already).
const WEIGHT_TO_GRAMS = { mg: 0.001, g: 1, gm: 1, gms: 1, kg: 1000 };

function normalizeWeightToGrams(value, fromUnit) {
  const n = toNumberVal(value);
  if (n === null) return null;
  const factor = WEIGHT_TO_GRAMS[String(fromUnit || 'g').toLowerCase()];
  if (!factor) return null;
  return Math.round(n * factor * 1000) / 1000; // 3 decimal places, matching the real column precision
}

// "22K" / "916" / "91.6" / "22 Karat" -> a normalized { karat, percentage }
// pair, checked later against the real tbl_purity_master rows (Karat/
// Percentage columns) rather than guessed at here.
function parseKaratPurity(v) {
  const s = toStringVal(v).toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  const karatMatch = s.match(/^(\d{1,2}(?:\.\d+)?)K(ARAT)?$/);
  if (karatMatch) {
    const karat = parseFloat(karatMatch[1]);
    return { karat, percentage: Math.round((karat / 24) * 1000) / 10 };
  }
  const num = parseFloat(s);
  if (!Number.isFinite(num)) return null;
  // A 3-digit "hallmark" number (916/750/995/999) is a percentage-per-mille
  // reading, not a raw percentage — 916 means 91.6%, not literally 916%.
  if (num > 100) return { karat: Math.round((num / 1000) * 24 * 10) / 10, percentage: num / 10 };
  // Otherwise treat it as already a percentage (e.g. "91.6").
  return { karat: Math.round((num / 100) * 24 * 10) / 10, percentage: num };
}

const TRANSFORMS = {
  trim: (v) => toStringVal(v),
  upper: (v) => toStringVal(v).toUpperCase(),
  lower: (v) => toStringVal(v).toLowerCase(),
  toNumber: (v) => toNumberVal(v),
  toBoolean: (v, params = {}) => toBooleanVal(v, params.fallback),
  toDateISO: (v) => toDateISO(v),
  normalizeGender: (v) => normalizeGender(v),
  normalizeWeightToGrams: (v, params = {}) => normalizeWeightToGrams(v, params.fromUnit),
  parseKaratPurity: (v) => parseKaratPurity(v),
  digitsOnly: (v) => toStringVal(v).replace(/\D/g, ''),
};

/**
 * Applies one transformation rule to one raw value. `rule` is either a
 * plain string (a TRANSFORMS key, no params) or { type, params }. An
 * unmapped/absent rule passes the value through unchanged (trimmed if a
 * string) — most fields need no transformation at all.
 */
function applyTransformation(rawValue, rule) {
  if (!rule) return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  const type = typeof rule === 'string' ? rule : rule.type;
  const params = typeof rule === 'string' ? {} : (rule.params || {});
  const fn = TRANSFORMS[type];
  if (!fn) return rawValue; // unknown rule name — pass through rather than throw, a bad Transformation_Rule shouldn't crash validation
  return fn(rawValue, params);
}

module.exports = {
  TRANSFORMS, applyTransformation,
  toStringVal, toNumberVal, toBooleanVal, toDateISO, normalizeGender, normalizeWeightToGrams, parseKaratPurity,
};
