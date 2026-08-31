/**
 * Data Migration Center — duplicate detection against the REAL target
 * tenant's live data (design doc §25). Uses the tenantDb proxy
 * (server/src/db/tenantDb.js) the same way every ordinary route does —
 * these functions must only ever be called from inside a
 * runWithTenantDb(targetConn, ...) block (see migrationRoutes.js's
 * validate route), so `tenantDb(...)` here transparently resolves to the
 * correct TARGET tenant, not the caller's (Super Admin's) own tenant.
 *
 * Each check matches the real unique constraint that table actually has —
 * Customer by Mobile_1 (unique per tenant), Product by Article_Number
 * (globally unique), Purchase/Sale by their own number columns — so a
 * "duplicate" found here is a genuine one, not a guessed heuristic.
 */
const { tenantDb: db } = require('../../db/tenantDb');

async function findCustomerDuplicate(tenantId, mapped) {
  if (!mapped.Mobile_1) return null;
  const row = await db('tbl_customer_master').where({ Tenant_ID: tenantId, Mobile_1: mapped.Mobile_1 }).first();
  return row ? { matchId: row.Customer_ID, matchField: 'Mobile_1', matchValue: mapped.Mobile_1, existingLabel: row.Customer_Name } : null;
}

async function findVendorDuplicate(tenantId, mapped) {
  if (!mapped.Mobile_1) return null;
  const row = await db('tbl_vendor_master').where({ Tenant_ID: tenantId, Mobile_1: mapped.Mobile_1 }).first();
  return row ? { matchId: row.Vendor_ID, matchField: 'Mobile_1', matchValue: mapped.Mobile_1, existingLabel: row.Vendor_Name } : null;
}

async function findProductDuplicate(_tenantId, mapped) {
  if (!mapped.Article_Number) return null; // no article number given — nothing to check yet, one gets generated at import time
  const row = await db('tbl_ornament_master').where({ Article_Number: mapped.Article_Number }).first(); // globally unique, not tenant-scoped
  return row ? { matchId: row.Ornament_ID, matchField: 'Article_Number', matchValue: mapped.Article_Number, existingLabel: row.Article_Number } : null;
}

async function findPurchaseDuplicate(tenantId, mapped) {
  if (!mapped.Supplier_Invoice_No) return null;
  const row = await db('tbl_purchase_header').where({ Tenant_ID: tenantId, Supplier_Invoice_No: mapped.Supplier_Invoice_No }).first();
  return row ? { matchId: row.Purchase_ID, matchField: 'Supplier_Invoice_No', matchValue: mapped.Supplier_Invoice_No, existingLabel: row.Purchase_Number } : null;
}

async function findSaleDuplicate(tenantId, mapped) {
  if (!mapped.Invoice_Number) return null;
  const row = await db('tbl_sales_header').where({ Tenant_ID: tenantId, Invoice_Number: mapped.Invoice_Number }).first();
  return row ? { matchId: row.Sale_ID, matchField: 'Invoice_Number', matchValue: mapped.Invoice_Number, existingLabel: row.Invoice_Number } : null;
}

const DUPLICATE_CHECKS = {
  customer: findCustomerDuplicate,
  vendor: findVendorDuplicate,
  product: findProductDuplicate,
  purchase: findPurchaseDuplicate,
  sale: findSaleDuplicate,
  payment: async () => null, // payments have no natural unique key of their own to check
};

/**
 * @param {string} tenantId - the target tenant (for the compound-unique lookups)
 * @param {string} entityType
 * @param {object} mappedData
 * @returns {Promise<null|{matchId, matchField, matchValue, existingLabel}>}
 */
async function checkDuplicate(tenantId, entityType, mappedData) {
  const fn = DUPLICATE_CHECKS[entityType];
  if (!fn) return null;
  return fn(tenantId, mappedData || {});
}

const VALID_DUPLICATE_ACTIONS = ['UseExisting', 'UpdateExisting', 'CreateNew', 'Skip', 'Merge'];

module.exports = { checkDuplicate, VALID_DUPLICATE_ACTIONS };
