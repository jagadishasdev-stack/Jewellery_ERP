/**
 * Data Migration Center — validation engine
 * (server/src/routes/migration/migrationValidate.js). Pure unit tests —
 * the rules are driven off the REAL schema constraints found for each
 * entity (customers.js/ornaments.js/etc.), so these tests double as
 * documentation of exactly what's required.
 */
const { validateRecord } = require('../src/routes/migration/migrationValidate');

test('customer: missing Customer_Name or Mobile_1 is a hard Error, matching the real required-field constraints', () => {
  const result = validateRecord('customer', { Mobile_1: '9876543210' });
  expect(result.status).toBe('Error');
  expect(result.messages.some((m) => m.field === 'Customer_Name')).toBe(true);
});

test('customer: an oddly-shaped mobile number is only a Warning, not a hard reject — the row still migrates', () => {
  const result = validateRecord('customer', { Customer_Name: 'Ramesh Kumar', Mobile_1: '12345' });
  expect(result.status).toBe('Warning');
});

test('customer: a fully valid record has zero messages and status Valid', () => {
  const result = validateRecord('customer', { Customer_Name: 'Ramesh Kumar', Mobile_1: '9876543210' });
  expect(result.status).toBe('Valid');
  expect(result.messages).toEqual([]);
});

test('product: Stone_Weight exceeding Gross_Weight is a real cross-field Error (a jewellery-specific impossible state)', () => {
  const result = validateRecord('product', { Gross_Weight: 5, Net_Gold_Weight: 4, Stone_Weight: 10, Purchase_Cost: 1000 });
  expect(result.status).toBe('Error');
  expect(result.messages.some((m) => m.field === 'Stone_Weight' && /cannot exceed/.test(m.message))).toBe(true);
});

test('product: a negative weight is rejected by the range check', () => {
  const result = validateRecord('product', { Gross_Weight: -1, Net_Gold_Weight: 1, Purchase_Cost: 100 });
  expect(result.status).toBe('Error');
});

test('product: no Article_Number is only a Warning (one gets auto-generated), never a hard Error', () => {
  const result = validateRecord('product', { Gross_Weight: 5, Net_Gold_Weight: 4.5, Purchase_Cost: 1000 });
  expect(result.status).toBe('Warning');
});

test('sale: Net_Payable_Amount is the one hard requirement; a missing Invoice_Number is only a Warning', () => {
  const missingAmount = validateRecord('sale', {});
  expect(missingAmount.status).toBe('Error');
  const missingInvoice = validateRecord('sale', { Net_Payable_Amount: 5000 });
  expect(missingInvoice.status).toBe('Warning');
});

test('payment: Amount and Payment_Mode are both required', () => {
  const result = validateRecord('payment', { Amount: 1000 });
  expect(result.status).toBe('Error');
  expect(result.messages.some((m) => m.field === 'Payment_Mode')).toBe(true);
});

test('an unknown entity type never throws — it comes back as a clean Error result', () => {
  const result = validateRecord('not_a_real_entity', {});
  expect(result.status).toBe('Error');
});
