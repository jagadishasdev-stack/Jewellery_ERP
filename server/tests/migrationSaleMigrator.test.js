/**
 * Data Migration Center — Sale migrator. Covers customer resolution by
 * name, Invoice Number Preservation, real balanced journal posting, and
 * the returned-sale path (Payment_Status='Cancelled', no journal posted
 * at all — a returned sale never had real money change hands worth
 * recording).
 */
const db = require('../src/db/knex');
const { getTenantDb } = require('../src/db/tenantDbResolver');
const { runWithTenantDb } = require('../src/db/tenantDb');
const { migrateCustomers } = require('../src/routes/migration/migrationEntities/customerMigrator');
const { migrateSales } = require('../src/routes/migration/migrationEntities/saleMigrator');
const testTenant = require('./helpers/testTenant');

let tenant, migrationId;

beforeAll(async () => {
  tenant = await testTenant.setup();
  const [m] = await db('migrations').insert({
    Migration_ID: `MIG-TESTSALE-${Date.now()}`, Tenant_ID: tenant.tenantId, Migration_Type: 'Transaction', Status: 'READY', Created_By: 1,
  }).returning('*');
  migrationId = m.Migration_ID;
});

afterAll(async () => {
  await db('migration_id_mappings').where('Migration_ID', migrationId).del();
  await db('migration_logs').where('Migration_ID', migrationId).del();
  await db('migrations').where('Migration_ID', migrationId).del();
  await db('tbl_sales_header').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).del();
  await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).del();
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
  return { dr, cr };
}

test('migrateSales resolves the customer by name, preserves the given Invoice_Number, and posts a real balanced journal (Cash portion + Receivable for the balance)', async () => {
  const targetConn = await getTenantDb(tenant.tenantId);
  const customerRows = [stagingRow({ Mapped_Data: { Customer_Name: 'QA Migrated Sale Customer', Mobile_1: '9700300001' } })];
  await runWithTenantDb(targetConn, () => migrateCustomers(targetConn, tenant.tenantId, customerRows, migrationId));

  const saleRows = [stagingRow({ Mapped_Data: { Customer_Name: 'qa migrated sale customer', Invoice_Number: 'QA-LEGACY-INV-001', Net_Payable_Amount: 20000, Amount_Paid: 12000, Payment_Mode: 'Cash' } })];
  const idMap = await runWithTenantDb(targetConn, () => migrateSales(targetConn, tenant.tenantId, saleRows, migrationId));
  const saleId = idMap.get(String(saleRows[0].Staging_ID));

  const sale = await db('tbl_sales_header').where('Sale_ID', saleId).first();
  expect(sale.Invoice_Number).toBe('QA-LEGACY-INV-001'); // preserved, not regenerated
  expect(sale.Customer_ID).not.toBeNull();
  expect(parseFloat(sale.Balance_Amount)).toBe(8000);
  expect(sale.Payment_Status).toBe('Partial');

  const journal = await journalBalances('SALE', saleId);
  expect(journal).not.toBeNull();
  expect(journal.dr).toBeCloseTo(journal.cr, 2);
  expect(journal.dr).toBeCloseTo(20000, 2);
});

test('migrateSales auto-generates an Invoice_Number when none is given', async () => {
  const targetConn = await getTenantDb(tenant.tenantId);
  const rows = [stagingRow({ Mapped_Data: { Net_Payable_Amount: 5000, Amount_Paid: 5000, Payment_Mode: 'Cash' } })];
  const idMap = await runWithTenantDb(targetConn, () => migrateSales(targetConn, tenant.tenantId, rows, migrationId));
  const sale = await db('tbl_sales_header').where('Sale_ID', idMap.get(String(rows[0].Staging_ID))).first();
  expect(sale.Invoice_Number).toMatch(/^INV-/);
});

test('a returned sale lands with Payment_Status=Cancelled and Returned_Date set, and NO journal is posted for it', async () => {
  const targetConn = await getTenantDb(tenant.tenantId);
  const rows = [stagingRow({ Mapped_Data: { Invoice_Number: 'QA-LEGACY-RETURNED-001', Net_Payable_Amount: 9000, Is_Returned: true } })];
  const idMap = await runWithTenantDb(targetConn, () => migrateSales(targetConn, tenant.tenantId, rows, migrationId));
  const saleId = idMap.get(String(rows[0].Staging_ID));

  const sale = await db('tbl_sales_header').where('Sale_ID', saleId).first();
  expect(sale.Payment_Status).toBe('Cancelled');
  expect(sale.Returned_Date).not.toBeNull();

  const journal = await journalBalances('SALE', saleId);
  expect(journal).toBeNull(); // no money changed hands worth recording
});
