/**
 * Data Migration Center — transformation rule library
 * (server/src/routes/migration/migrationTransform.js). Pure unit tests.
 */
const {
  toNumberVal, toBooleanVal, toDateISO, normalizeGender,
  normalizeWeightToGrams, parseKaratPurity, applyTransformation,
} = require('../src/routes/migration/migrationTransform');

test('toNumberVal strips currency symbols and thousands separators, matching real spreadsheet exports', () => {
  expect(toNumberVal('₹1,25,000')).toBe(125000);
  expect(toNumberVal('1,250.50')).toBe(1250.5);
  expect(toNumberVal('')).toBeNull();
  expect(toNumberVal('not a number')).toBeNull();
});

test('toBooleanVal accepts Excel\'s many real spellings of yes/no (doc §16 example: YES -> true)', () => {
  expect(toBooleanVal('YES')).toBe(true);
  expect(toBooleanVal('Y')).toBe(true);
  expect(toBooleanVal('1')).toBe(true);
  expect(toBooleanVal('NO')).toBe(false);
  expect(toBooleanVal('')).toBe(false);
  expect(toBooleanVal('', true)).toBe(true); // fallback honored
});

test('toDateISO parses common non-ISO spreadsheet date formats', () => {
  expect(toDateISO('31-08-2026')).toBe('2026-08-31');
  expect(toDateISO('31/08/2026')).toBe('2026-08-31');
  expect(toDateISO('2026-08-31')).toBe('2026-08-31');
  expect(toDateISO('garbage')).toBeNull();
});

test('normalizeGender: doc §16 example, M -> Male', () => {
  expect(normalizeGender('M')).toBe('Male');
  expect(normalizeGender('female')).toBe('Female');
  expect(normalizeGender('x')).toBeNull();
});

test('normalizeWeightToGrams: doc §17 unit examples, 1kg = 1000g, 1g = 1000mg', () => {
  expect(normalizeWeightToGrams(1, 'kg')).toBe(1000);
  expect(normalizeWeightToGrams(1000, 'mg')).toBe(1);
  expect(normalizeWeightToGrams(5.5, 'g')).toBe(5.5);
});

test('parseKaratPurity: doc §17 examples — 22K, 916, 91.6 all normalize consistently', () => {
  expect(parseKaratPurity('22K')).toEqual({ karat: 22, percentage: 91.7 });
  const from916 = parseKaratPurity('916');
  expect(from916.percentage).toBe(91.6);
  expect(from916.karat).toBeCloseTo(22, 0);
  const from916pct = parseKaratPurity('91.6');
  expect(from916pct.percentage).toBe(91.6);
});

test('applyTransformation: no rule passes the value through (trimmed if a string), unknown rule name never throws', () => {
  expect(applyTransformation('  hello  ', null)).toBe('hello');
  expect(applyTransformation('x', { type: 'not_a_real_transform' })).toBe('x');
});

test('applyTransformation: a parameterized rule (weight unit) actually uses its params', () => {
  expect(applyTransformation('2', { type: 'normalizeWeightToGrams', params: { fromUnit: 'kg' } })).toBe(2000);
});
