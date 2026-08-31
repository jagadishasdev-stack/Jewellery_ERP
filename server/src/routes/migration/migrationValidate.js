/**
 * Data Migration Center — per-entity validation, driven off the REAL
 * column constraints found by exploring the live schema/creation routes
 * (customers.js/karigar.js/ornaments.js/purchase.js/sales.js), not
 * assumptions. Pure functions — takes already-mapped+transformed data,
 * returns a verdict; no DB access (duplicate/relationship checks that
 * need the live tenant DB live in migrationDuplicate.js).
 */
const { toNumberVal } = require('./migrationTransform');

const MOBILE_RE = /^[6-9]\d{9}$/; // matches customers.js's isMobilePhone('en-IN') intent closely enough for a bulk pre-check

function required(mapped, field, messages) {
  const v = mapped[field];
  if (v === null || v === undefined || v === '') {
    messages.push({ field, message: `${field} is required.` });
    return false;
  }
  return true;
}

function numberInRange(mapped, field, { min, max, required: isRequired = false } = {}, messages, severity = 'error') {
  const raw = mapped[field];
  if (raw === null || raw === undefined || raw === '') {
    if (isRequired) messages.push({ field, message: `${field} is required.`, severity: 'error' });
    return;
  }
  const n = toNumberVal(raw);
  if (n === null) { messages.push({ field, message: `${field} must be a number (got "${raw}").`, severity: 'error' }); return; }
  if (min !== undefined && n < min) messages.push({ field, message: `${field} cannot be less than ${min}.`, severity });
  if (max !== undefined && n > max) messages.push({ field, message: `${field} cannot exceed ${max}.`, severity });
}

const VALIDATORS = {
  customer: (mapped) => {
    const messages = [];
    required(mapped, 'Customer_Name', messages);
    if (required(mapped, 'Mobile_1', messages)) {
      const digits = String(mapped.Mobile_1).replace(/\D/g, '').slice(-10);
      if (!MOBILE_RE.test(digits)) messages.push({ field: 'Mobile_1', message: `Mobile_1 "${mapped.Mobile_1}" doesn't look like a valid 10-digit Indian mobile number.`, severity: 'warning' });
    }
    return messages;
  },
  vendor: (mapped) => {
    const messages = [];
    required(mapped, 'Vendor_Name', messages);
    required(mapped, 'Mobile_1', messages);
    numberInRange(mapped, 'Opening_Balance', {}, messages, 'warning');
    return messages;
  },
  product: (mapped) => {
    const messages = [];
    numberInRange(mapped, 'Gross_Weight', { min: 0.001, required: true }, messages);
    numberInRange(mapped, 'Net_Gold_Weight', { min: 0, required: true }, messages);
    numberInRange(mapped, 'Stone_Weight', { min: 0 }, messages, 'warning');
    numberInRange(mapped, 'Purchase_Cost', { min: 0, required: true }, messages);
    // Stone weight can never legitimately exceed gross weight — a real
    // range check the doc itself names (§22 "weight cannot be negative"
    // generalized to this cross-field jewellery-specific case).
    const gross = toNumberVal(mapped.Gross_Weight), stone = toNumberVal(mapped.Stone_Weight);
    if (gross !== null && stone !== null && stone > gross) {
      messages.push({ field: 'Stone_Weight', message: `Stone_Weight (${stone}g) cannot exceed Gross_Weight (${gross}g).` });
    }
    if (!mapped.Article_Number) messages.push({ field: 'Article_Number', message: 'No Article Number given — one will be auto-generated.', severity: 'warning' });
    return messages;
  },
  purchase: (mapped) => {
    const messages = [];
    numberInRange(mapped, 'Total_Amount', { min: 0.01, required: true }, messages);
    if (!mapped.Supplier_Name) messages.push({ field: 'Supplier_Name', message: 'No supplier name given.', severity: 'warning' });
    return messages;
  },
  sale: (mapped) => {
    const messages = [];
    numberInRange(mapped, 'Net_Payable_Amount', { min: 0.01, required: true }, messages);
    if (!mapped.Invoice_Number) messages.push({ field: 'Invoice_Number', message: 'No original invoice number given — a new one will be generated.', severity: 'warning' });
    return messages;
  },
  payment: (mapped) => {
    const messages = [];
    numberInRange(mapped, 'Amount', { min: 0.01, required: true }, messages);
    required(mapped, 'Payment_Mode', messages);
    return messages;
  },
};

/**
 * Validates one already-mapped record. Returns 'Error' if any message has
 * no explicit severity (errors are the default — a validator that wants
 * a soft warning must say so explicitly, so a forgotten severity never
 * silently downgrades a real problem) or severity:'error'; 'Warning' if
 * only warnings; 'Valid' if no messages at all.
 */
function validateRecord(entityType, mappedData) {
  const validator = VALIDATORS[entityType];
  if (!validator) return { status: 'Error', messages: [{ field: null, message: `Unknown entity type "${entityType}".` }] };
  const messages = validator(mappedData || {}).map((m) => ({ severity: 'error', ...m }));
  const hasError = messages.some((m) => m.severity === 'error');
  const status = messages.length === 0 ? 'Valid' : hasError ? 'Error' : 'Warning';
  return { status, messages };
}

module.exports = { validateRecord, VALIDATORS };
