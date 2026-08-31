/**
 * Data Migration Center — Product/Ornament migrator. Global-master
 * (Type/Design/Purity — no Tenant_ID, shared across every tenant on the
 * platform) resolution is the interesting part here: reuse an existing
 * row by natural-key match, only create a new one when nothing is
 * genuinely close. These globals are shared across the WHOLE test suite
 * (not reset per file), so tests use distinctive names/values rather
 * than asserting exact row counts.
 */
const db = require('../src/db/knex');
const { getTenantDb } = require('../src/db/tenantDbResolver');
const { runWithTenantDb } = require('../src/db/tenantDb');
const { migrateProducts, resolveTypeId, resolveDesignId, resolvePurityId } = require('../src/routes/migration/migrationEntities/productMigrator');
const testTenant = require('./helpers/testTenant');

let tenant, migrationId;

beforeAll(async () => {
  tenant = await testTenant.setup();
  const [m] = await db('migrations').insert({
    Migration_ID: `MIG-TESTPROD-${Date.now()}`, Tenant_ID: tenant.tenantId, Migration_Type: 'Master', Status: 'READY', Created_By: 1,
  }).returning('*');
  migrationId = m.Migration_ID;
});

afterAll(async () => {
  await db('migration_id_mappings').where('Migration_ID', migrationId).del();
  await db('migration_logs').where('Migration_ID', migrationId).del();
  await db('migrations').where('Migration_ID', migrationId).del();
  await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).del();
  await db('tbl_design_master').where('Design_Name', 'like', 'QA Migration%').del();
  await db('tbl_item_type_master').where('Type_Name', 'like', 'QA Migration%').del();
  await db('tbl_purity_master').where('Purity_Code', 'like', '17K%').del();
  await testTenant.teardown();
  await db.destroy();
});

function stagingRow(overrides) {
  return { Staging_ID: Math.floor(Math.random() * 1e9), Source_Row: 2, Validation_Status: 'Valid', Import_Status: 'Pending', Duplicate_Action: null, Duplicate_Match_Id: null, ...overrides };
}

test('resolveTypeId creates a new global type when no match exists, then reuses it on a second call (idempotent within one migration)', async () => {
  const targetConn = await getTenantDb(tenant.tenantId);
  const id1 = await runWithTenantDb(targetConn, () => resolveTypeId(targetConn, 'QA Migration Test Type'));
  const id2 = await runWithTenantDb(targetConn, () => resolveTypeId(targetConn, 'qa migration test type')); // different case — must still match
  expect(id1).toBe(id2);
  const row = await db('tbl_item_type_master').where('Type_ID', id1).first();
  expect(row.Type_Name).toBe('QA Migration Test Type');
  expect(row.Tenant_ID).toBeUndefined(); // confirms this table genuinely has no Tenant_ID column
});

test('resolvePurityId reuses the real existing 22K global row (within tolerance) rather than creating a near-duplicate', async () => {
  const targetConn = await getTenantDb(tenant.tenantId);
  const existing22k = await db('tbl_purity_master').where('Purity_Code', '22K').first();
  const resolved = await runWithTenantDb(targetConn, () => resolvePurityId(targetConn, '22K'));
  expect(resolved).toBe(existing22k.Purity_ID);
});

test('resolvePurityId creates a genuinely new row when nothing is close enough (17K has no near match in the seeded set)', async () => {
  const targetConn = await getTenantDb(tenant.tenantId);
  const resolved = await runWithTenantDb(targetConn, () => resolvePurityId(targetConn, '17K'));
  const row = await db('tbl_purity_master').where('Purity_ID', resolved).first();
  expect(row.Purity_Code).toMatch(/^17K/);
  expect(parseFloat(row.Karat)).toBe(17);
});

test('migrateProducts inserts a real ornament with resolved Type/Design/Purity IDs, an auto-generated Article_Number, and historical Purchase_Cost as Total_Price (no fabricated GST/wastage breakdown)', async () => {
  const targetConn = await getTenantDb(tenant.tenantId);
  const rows = [stagingRow({
    Mapped_Data: {
      Gross_Weight: 10, Net_Gold_Weight: 9.2, Stone_Weight: 0.3, Purchase_Cost: 55000,
      Type_Name: 'QA Migration Test Type', Design_Name: 'QA Migration Test Design', Purity_Text: '22K', Metal_Type: 'Gold',
    },
  })];

  const idMap = await runWithTenantDb(targetConn, () => migrateProducts(targetConn, tenant.tenantId, rows, migrationId));
  const newId = idMap.get(String(rows[0].Staging_ID));
  const ornament = await db('tbl_ornament_master').where('Ornament_ID', newId).first();

  expect(ornament.Article_Number).toMatch(/^ART-/); // auto-generated since none was given
  expect(parseFloat(ornament.Total_Price)).toBe(55000);
  expect(parseFloat(ornament.Taxable_Value)).toBe(55000);
  expect(ornament.Type_ID).not.toBeNull();
  expect(ornament.Design_ID).not.toBeNull();
  expect(ornament.Purity_ID).not.toBeNull();

  const type = await db('tbl_item_type_master').where('Type_ID', ornament.Type_ID).first();
  expect(type.Type_Name).toBe('QA Migration Test Type');
  const design = await db('tbl_design_master').where('Design_ID', ornament.Design_ID).first();
  expect(design.Type_ID).toBe(ornament.Type_ID); // the design correctly links back to the resolved type
});
