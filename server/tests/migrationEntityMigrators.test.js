/**
 * Data Migration Center — entity migrators (Vendor, Customer so far).
 * Calls the migrator functions directly (not through the HTTP pipeline —
 * that's covered end-to-end once all migrators + the processor exist) to
 * verify: real rows land in the real target tenant DB, ID mapping is
 * correct and in the right order, duplicate-resolution paths (Skip/
 * UseExisting) behave correctly, and Import_Status='Imported'/Validation_
 * Status='Error' rows are correctly excluded (idempotency + safety).
 */
const db = require('../src/db/knex');
const { getTenantDb } = require('../src/db/tenantDbResolver');
const { runWithTenantDb } = require('../src/db/tenantDb');
const { migrateVendors } = require('../src/routes/migration/migrationEntities/vendorMigrator');
const { migrateCustomers } = require('../src/routes/migration/migrationEntities/customerMigrator');
const testTenant = require('./helpers/testTenant');

let tenant, migrationId;

beforeAll(async () => {
  tenant = await testTenant.setup();
  const [m] = await db('migrations').insert({
    Migration_ID: `MIG-TESTMIG-${Date.now()}`, Tenant_ID: tenant.tenantId, Migration_Type: 'Master', Status: 'READY', Created_By: 1,
  }).returning('*');
  migrationId = m.Migration_ID;
});

afterAll(async () => {
  await db('migration_id_mappings').where('Migration_ID', migrationId).del();
  await db('migration_logs').where('Migration_ID', migrationId).del();
  await db('migrations').where('Migration_ID', migrationId).del();
  await db('tbl_vendor_master').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).del();
  await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).del();
  await testTenant.teardown();
  await db.destroy();
});

function stagingRow(overrides) {
  return { Staging_ID: Math.floor(Math.random() * 1e9), Source_Row: 2, Validation_Status: 'Valid', Import_Status: 'Pending', Duplicate_Action: null, Duplicate_Match_Id: null, ...overrides };
}

test('migrateVendors inserts real rows into the target tenant, with a correct old->new ID map', async () => {
  const targetConn = await getTenantDb(tenant.tenantId);
  const rows = [
    stagingRow({ Mapped_Data: { Vendor_Name: 'QA Migrated Supplier 1', Mobile_1: '9700000001' } }),
    stagingRow({ Mapped_Data: { Vendor_Name: 'QA Migrated Supplier 2', Mobile_1: '9700000002' } }),
  ];

  const idMap = await runWithTenantDb(targetConn, () => migrateVendors(targetConn, tenant.tenantId, rows, migrationId));

  expect(idMap.size).toBe(2);
  const newId1 = idMap.get(String(rows[0].Staging_ID));
  const newId2 = idMap.get(String(rows[1].Staging_ID));
  expect(newId1).toBeDefined();
  expect(newId2).toBeDefined();
  expect(newId1).not.toBe(newId2);

  const v1 = await db('tbl_vendor_master').where('Vendor_ID', newId1).first();
  expect(v1.Vendor_Name).toBe('QA Migrated Supplier 1'); // proves RETURNING order matched input order, not just "2 rows landed somewhere"

  const mapRows = await db('migration_id_mappings').where({ Migration_ID: migrationId, Entity_Type: 'vendor' });
  expect(mapRows.length).toBe(2);
  const logRows = await db('migration_logs').where({ Migration_ID: migrationId, Entity_Type: 'vendor', Status: 'SUCCESS' });
  expect(logRows.length).toBe(2);
});

test('migrateVendors skips Error/Skip/already-Imported rows, and folds an UseExisting row into the id map without inserting', async () => {
  const targetConn = await getTenantDb(tenant.tenantId);
  const existing = await db('tbl_vendor_master').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).first();

  const rows = [
    stagingRow({ Mapped_Data: {}, Validation_Status: 'Error' }),
    stagingRow({ Mapped_Data: { Vendor_Name: 'Should not import', Mobile_1: '9700000099' }, Import_Status: 'Imported' }),
    stagingRow({ Mapped_Data: { Vendor_Name: 'Should not import either', Mobile_1: '9700000098' }, Duplicate_Action: 'Skip' }),
    stagingRow({ Mapped_Data: { Vendor_Name: 'Existing Vendor', Mobile_1: '9700000097' }, Duplicate_Action: 'UseExisting', Duplicate_Match_Id: existing.Vendor_ID }),
  ];

  const before = await db('tbl_vendor_master').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).count('* as c').first();
  const idMap = await runWithTenantDb(targetConn, () => migrateVendors(targetConn, tenant.tenantId, rows, migrationId));
  const after = await db('tbl_vendor_master').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).count('* as c').first();

  expect(parseInt(after.c)).toBe(parseInt(before.c)); // nothing new actually inserted
  expect(idMap.get(String(rows[3].Staging_ID))).toBe(existing.Vendor_ID); // UseExisting resolved correctly
  expect(idMap.has(String(rows[0].Staging_ID))).toBe(false);
  expect(idMap.has(String(rows[1].Staging_ID))).toBe(false);
  expect(idMap.has(String(rows[2].Staging_ID))).toBe(false);
});

test('migrateCustomers inserts real customers with a correctly formatted, tenant-scoped Customer_Code', async () => {
  const targetConn = await getTenantDb(tenant.tenantId);
  const rows = [stagingRow({ Mapped_Data: { Customer_Name: 'QA Migrated Customer 1', Mobile_1: '9700100001' } })];

  const idMap = await runWithTenantDb(targetConn, () => migrateCustomers(targetConn, tenant.tenantId, rows, migrationId));
  const newId = idMap.get(String(rows[0].Staging_ID));
  const customer = await db('tbl_customer_master').where('Customer_ID', newId).first();
  expect(customer.Customer_Name).toBe('QA Migrated Customer 1');
  expect(customer.Customer_Code).toMatch(new RegExp(`^CUST-${tenant.tenantId.replace('_', '')}-\\d{5}$`));
  expect(customer.Data_Mode).toBe(3);
});
