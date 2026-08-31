/**
 * Data Migration Center — the rule-based sheet/column detection engine
 * (server/src/routes/migration/migrationDetection.js). Pure unit tests,
 * no DB/HTTP needed — this is deterministic scoring logic.
 */
const {
  similarityScore, bestFieldMatch, detectSheetEntity, suggestColumnMapping,
  AUTO_APPROVE_THRESHOLD, REVIEW_THRESHOLD,
} = require('../src/routes/migration/migrationDetection');

test('similarityScore: an exact header match (after normalizing case/punctuation) scores near-certain', () => {
  expect(similarityScore('CUSTOMER_NAME', 'customer_name')).toBeGreaterThanOrEqual(AUTO_APPROVE_THRESHOLD);
  expect(similarityScore('Mobile No', 'mobile_no')).toBeGreaterThanOrEqual(AUTO_APPROVE_THRESHOLD);
});

test('similarityScore: a genuinely unrelated header scores 0, not some arbitrary low positive number', () => {
  expect(similarityScore('Zebra Crossing Count', 'gstin')).toBe(0);
});

test('bestFieldMatch: picks the correct target field for a real-world header variant, matching the doc\'s own example table', () => {
  const gstin = bestFieldMatch('GSTIN', 'customer');
  expect(gstin.targetField).toBe('GST_No');
  expect(gstin.confidence).toBeGreaterThanOrEqual(AUTO_APPROVE_THRESHOLD);

  const phone2 = bestFieldMatch('PHONE2', 'customer');
  expect(phone2.targetField).toBe('Mobile_2');
});

test('detectSheetEntity: a sheet named "Customer Master" with customer-shaped columns is detected as customer, not vendor or product', () => {
  const result = detectSheetEntity('Customer Master', ['CUSTOMER_NAME', 'MOBILE_NO', 'ADDRESS', 'CITY', 'GSTIN']);
  expect(result.entityType).toBe('customer');
  expect(result.confidence).toBeGreaterThan(0);
});

test('detectSheetEntity: an ambiguously-named sheet is still detected correctly from its columns alone', () => {
  const result = detectSheetEntity('Sheet1', ['ITEM_CODE', 'GROSS_WT', 'NET_WT', 'STONE_WT', 'PURCHASE_RATE']);
  expect(result.entityType).toBe('product');
});

test('detectSheetEntity: a sheet with no recognizable columns at all returns null rather than a false-confidence guess', () => {
  const result = detectSheetEntity('Random Notes', ['Column A', 'Column B', 'Some Comment']);
  expect(result).toBeNull();
});

test('suggestColumnMapping: every header from the doc\'s own worked example lands in the right confidence band', () => {
  const mapping = suggestColumnMapping(['CUSTOMER_ID', 'CUSTOMER_NAME', 'MOBILE_NO', 'GSTIN', 'ADDRESS', 'CITY'], 'customer');
  const byField = Object.fromEntries(mapping.map((m) => [m.sourceField, m]));
  expect(byField['CUSTOMER_NAME'].targetField).toBe('Customer_Name');
  expect(byField['CUSTOMER_NAME'].status).toBe('auto');
  expect(byField['MOBILE_NO'].targetField).toBe('Mobile_1');
  expect(byField['GSTIN'].targetField).toBe('GST_No');
});

test('suggestColumnMapping: an unrecognizable column is marked unmapped, never silently assigned a wrong field', () => {
  const mapping = suggestColumnMapping(['Some Totally Unrelated Column XYZ'], 'customer');
  expect(mapping[0].targetField).toBeNull();
  expect(mapping[0].status).toBe('unmapped');
});

test('confidence thresholds match the doc\'s own numbers (90-100 auto, 70-89 review, below manual)', () => {
  expect(AUTO_APPROVE_THRESHOLD).toBe(90);
  expect(REVIEW_THRESHOLD).toBe(70);
});
