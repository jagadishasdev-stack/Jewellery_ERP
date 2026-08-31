/**
 * Data Migration Center — Purchase and standalone Payment migrators.
 * Both must post REAL double-entry journal entries via the same shared
 * utilities the live routes use, not raw table inserts — checked here by
 * verifying the resulting tbl_accounting_journal/tbl_accounting_entries
 * rows actually balance (Dr sum === Cr sum), the same integrity check
 * postJournal() itself enforces.
 */
const request = require('supertest');
const db = require('../src/db/knex');
const { app } = require('../src/index');
const { getTenantDb } = require('../src/db/tenantDbResolver');
const { runWithTenantDb } = require('../src/db/tenantDb');
const { migrateVendors } = require('../src/routes/migration/migrationEntities/vendorMigrator');
const { migratePurchases } = require('../src/routes/migration/migrationEntities/purchaseMigrator');
const { migratePayments } = require('../src/routes/migration/migrationEntities/paymentMigrator');
const testTenant = require('./helpers/testTenant');

let tenant, token, migrationId, typeId;

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  const [m] = await db('migrations').insert({
    Migration_ID: `MIG-TESTPP-${Date.now()}`, Tenant_ID: tenant.tenantId, Migration_Type: 'Transaction', Status: 'READY', Created_By: 1,
  }).returning('*');
  migrationId = m.Migration_ID;
});

afterAll(async () => {
  await db('migration_id_mappings').where('Migration_ID', migrationId).del();
  await db('migration_logs').where('Migration_ID', migrationId).del();
  await db('migrations').where('Migration_ID', migrationId).del();
  await db('tbl_purchase_header').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).del();
  await db('tbl_sales_payments').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).del();
  await db('tbl_vendor_master').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).del();
  await testTenant.teardown();
  await db.destroy();
});

function stagingRow(overrides) {
  return { Staging_ID: Math.floor(Math.random() * 1e9), Source_Row: 2, Validation_Status: 'Valid', Import_Status: 'Pending', Duplicate_Action: null, Duplicate_Match_Id: null, ...overrides };
}

async function journalBalances(sourceType, sourceId) {
  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Source_Type: sourceType, Source_ID: sourceId }).orderBy('Journal_ID', 'desc').first();
  if (!journal) return null;
  const entries = await db('tbl_accounting_entries').where('Journal_ID', journal.Journal_ID);
  const dr = entries.filter((e) => e.Entry_Type === 'Dr').reduce((s, e) => s + parseFloat(e.Amount), 0);
  const cr = entries.filter((e) => e.Entry_Type === 'Cr').reduce((s, e) => s + parseFloat(e.Amount), 0);
  return { journal, entries, dr, cr };
}

test('migratePurchases resolves the vendor by name, sets Status=Received directly, computes Balance/Payment_Status, and posts a REAL balanced journal (including a payment journal for the paid portion)', async () => {
  const targetConn = await getTenantDb(tenant.tenantId);

  const vendorRows = [stagingRow({ Mapped_Data: { Vendor_Name: 'QA Migrated PO Supplier', Mobile_1: '9700200001' } })];
  await runWithTenantDb(targetConn, () => migrateVendors(targetConn, tenant.tenantId, vendorRows, migrationId));

  const purchaseRows = [stagingRow({ Mapped_Data: { Supplier_Name: 'qa migrated po supplier', Total_Amount: 50000, Amount_Paid: 20000, Payment_Mode: 'Cash' } })];
  const idMap = await runWithTenantDb(targetConn, () => migratePurchases(targetConn, tenant.tenantId, purchaseRows, migrationId));
  const purchaseId = idMap.get(String(purchaseRows[0].Staging_ID));

  const purchase = await db('tbl_purchase_header').where('Purchase_ID', purchaseId).first();
  expect(purchase.Status).toBe('Received');
  expect(purchase.Supplier_ID).not.toBeNull(); // resolved by name, case-insensitively
  expect(parseFloat(purchase.Amount_Paid)).toBe(20000);
  expect(parseFloat(purchase.Balance_Amount)).toBe(30000);
  expect(purchase.Payment_Status).toBe('Partial');

  const accrual = await journalBalances('PURCHASE', purchaseId);
  expect(accrual).not.toBeNull();
  expect(accrual.dr).toBeCloseTo(accrual.cr, 2);
  expect(accrual.dr).toBeCloseTo(50000, 2);

  const payment = await journalBalances('PAYMENT', purchaseId);
  expect(payment).not.toBeNull();
  expect(payment.dr).toBeCloseTo(payment.cr, 2);
  expect(payment.dr).toBeCloseTo(20000, 2);
});

test('migratePayments applies a standalone receipt to a real existing Sale by matching Invoice_Number, and posts a balanced journal', async () => {
  const ornament = await request(app).post('/api/ornaments').set({ Authorization: `Bearer ${token}` }).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 15000, Total_Price: 18000, Article_Number: 'QAPAYMIG-0001',
  });
  const sale = await request(app).post('/api/sales/create').set({ Authorization: `Bearer ${token}` }).send({
    Payment_Mode: 'Cash', Amount_Paid: 0,
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: 'QAPAYMIG-0001', Total_Line_Price: 18000 }],
  });
  const invoiceNumber = sale.body.data.sale.Invoice_Number;
  const saleId = sale.body.data.sale.Sale_ID;

  const targetConn = await getTenantDb(tenant.tenantId);
  const rows = [stagingRow({ Mapped_Data: { Amount: 18000, Payment_Mode: 'UPI', Against_Number: invoiceNumber } })];
  const applied = await runWithTenantDb(targetConn, () => migratePayments(targetConn, tenant.tenantId, rows, migrationId));
  expect(applied).toBe(1);

  const updatedSale = await db('tbl_sales_header').where('Sale_ID', saleId).first();
  expect(parseFloat(updatedSale.Amount_Paid)).toBe(18000);
  expect(updatedSale.Payment_Status).toBe('Paid');

  const journal = await journalBalances('PAYMENT', saleId);
  expect(journal).not.toBeNull();
  expect(journal.dr).toBeCloseTo(journal.cr, 2);
  expect(journal.dr).toBeCloseTo(18000, 2);

  await db('tbl_sales_payments').where({ Sale_ID: saleId, Created_By: 'migration' }).del();
});

test('migratePayments skips a payment that cannot be matched to any real Sale or Purchase, without throwing', async () => {
  const targetConn = await getTenantDb(tenant.tenantId);
  const rows = [stagingRow({ Mapped_Data: { Amount: 5000, Payment_Mode: 'Cash', Against_Number: 'NO-SUCH-INVOICE-XYZ' } })];
  const applied = await runWithTenantDb(targetConn, () => migratePayments(targetConn, tenant.tenantId, rows, migrationId));
  expect(applied).toBe(0);
  const log = await db('migration_logs').where({ Migration_ID: migrationId, Entity_Type: 'payment', Status: 'SKIPPED' }).orderBy('Log_ID', 'desc').first();
  expect(log.Message).toMatch(/Could not match/);
});
