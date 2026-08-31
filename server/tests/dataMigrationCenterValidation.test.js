/**
 * Data Migration Center — mapping confirmation, validation engine,
 * duplicate detection against real target-tenant data, and the preview
 * summary. Continues from the foundation layer covered in
 * dataMigrationCenter.test.js.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, saToken, tenantToken, saUserId, migrationId, existingCustomerMobile;
const saAuth = () => ({ Authorization: `Bearer ${saToken}` });

const SA_USERNAME = 'qatest_sa_migval';
const SA_PASSWORD = 'QaTestSA@2026mv';

function buildWorkbookBuffer(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

beforeAll(async () => {
  tenant = await testTenant.setup();

  const role = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(SA_PASSWORD, salt);
  const [saUser] = await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_USERNAME, Password_Hash: hash, Password_Salt: salt,
    Role_ID: role.Role_ID, Full_Name: 'QA Test SA (migration validation)', Is_Active: true, Is_Admin: true, Created_By: 'test',
  }).returning('*');
  saUserId = saUser.User_ID;

  const saRes = await request(app).post('/api/auth/login').send({ username: SA_USERNAME, password: SA_PASSWORD, tenantId: 'SA_MASTER' });
  saToken = saRes.body.data.token;

  const tRes = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  tenantToken = tRes.body.data.token;

  // A real, pre-existing customer in the target tenant — used to prove
  // duplicate detection checks against LIVE tenant data, not just
  // within the uploaded batch.
  existingCustomerMobile = '9811100001';
  await request(app).post('/api/customers').set({ Authorization: `Bearer ${tenantToken}` }).send({ Customer_Name: 'QA Existing Customer', Mobile_1: existingCustomerMobile });

  // Set up one migration through analyze, ready for mapping/validation.
  const create = await request(app).post('/api/migrations').set(saAuth()).send({ Tenant_ID: tenant.tenantId, Migration_Type: 'Full' });
  migrationId = create.body.data.Migration_ID;

  const xlsxBuffer = buildWorkbookBuffer({
    'Customer Master': [
      { CUSTOMER_NAME: 'QA New Customer 1', MOBILE_NO: '9822200001', GSTIN: '' },
      { CUSTOMER_NAME: '', MOBILE_NO: '9822200002' }, // missing name -> Error
      { CUSTOMER_NAME: 'QA Duplicate Customer', MOBILE_NO: existingCustomerMobile }, // matches the pre-existing customer -> duplicate
    ],
  });
  await request(app).post(`/api/migrations/${migrationId}/files`).set(saAuth()).attach('files', xlsxBuffer, 'customers.xlsx');
  await request(app).post(`/api/migrations/${migrationId}/analyze`).set(saAuth()).send();
});

afterAll(async () => {
  await db('migration_mappings').where('Migration_ID', migrationId).del();
  await db('migration_staging_records').where('Migration_ID', migrationId).del();
  await db('migration_files').where('Migration_ID', migrationId).del();
  await db('migrations').where('Migration_ID', migrationId).del();
  await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId, Mobile_1: existingCustomerMobile }).del();
  if (saUserId) await db('tbl_user_master').where({ User_ID: saUserId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('GET /:id/mapping returns the auto-suggested mapping for the detected Customer Master sheet', async () => {
  const res = await request(app).get(`/api/migrations/${migrationId}/mapping`).set(saAuth());
  expect(res.status).toBe(200);
  const group = res.body.data.find((g) => g.entityType === 'customer');
  expect(group).toBeDefined();
  const nameField = group.fields.find((f) => f.sourceField === 'CUSTOMER_NAME');
  expect(nameField.targetField).toBe('Customer_Name');
});

test('POST /:id/mapping saves a manual correction, and validate is rejected until status is MAPPING (still is, at this point)', async () => {
  const res = await request(app).post(`/api/migrations/${migrationId}/mapping`).set(saAuth()).send({
    mappings: [{ entityType: 'customer', sourceFile: 'customers.xlsx', sourceSheet: 'Customer Master', sourceField: 'GSTIN', targetField: 'GST_No', isApproved: true }],
  });
  expect(res.status).toBe(200);
  const saved = await db('migration_mappings').where({ Migration_ID: migrationId, Source_Field: 'GSTIN' }).first();
  expect(saved.Target_Field).toBe('GST_No');
  expect(saved.Mapping_Type).toBe('Manual');
});

test('POST /:id/validate builds Mapped_Data, classifies every record, and detects the real duplicate against live tenant data', async () => {
  const res = await request(app).post(`/api/migrations/${migrationId}/validate`).set(saAuth()).send();
  expect(res.status).toBe(200);
  expect(res.body.data.total).toBe(3);
  expect(res.body.data.Error).toBe(1); // the row with no Customer_Name
  expect(res.body.data.duplicates).toBe(1); // the row matching the pre-existing customer

  const migration = await request(app).get(`/api/migrations/${migrationId}`).set(saAuth());
  expect(migration.body.data.Status).toBe('READY');

  const rows = await db('migration_staging_records').where('Migration_ID', migrationId).orderBy('Staging_ID');
  const withName = rows.find((r) => r.Raw_Data.CUSTOMER_NAME === 'QA New Customer 1');
  expect(withName.Mapped_Data.Customer_Name).toBe('QA New Customer 1');
  expect(withName.Validation_Status).toBe('Valid');
  expect(withName.Is_Duplicate).toBe(false);

  const dupRow = rows.find((r) => r.Raw_Data.CUSTOMER_NAME === 'QA Duplicate Customer');
  expect(dupRow.Is_Duplicate).toBe(true);
  expect(dupRow.Duplicate_Match_Id).not.toBeNull();
});

test('validate cannot be re-run once status has moved past MAPPING', async () => {
  const res = await request(app).post(`/api/migrations/${migrationId}/validate`).set(saAuth()).send();
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/MAPPING/);
});

test('GET /:id/preview summarizes per-entity Valid/Warning/Error counts and the duplicate count', async () => {
  const res = await request(app).get(`/api/migrations/${migrationId}/preview`).set(saAuth());
  expect(res.status).toBe(200);
  expect(res.body.data.byEntity.customer.total).toBe(3);
  expect(res.body.data.byEntity.customer.Error).toBe(1);
  expect(res.body.data.duplicateCount).toBe(1);
});

test('GET /:id/duplicates lists only the duplicate row, and POST /duplicates/resolve marks it', async () => {
  const dups = await request(app).get(`/api/migrations/${migrationId}/duplicates`).set(saAuth());
  expect(dups.status).toBe(200);
  expect(dups.body.data.length).toBe(1);
  const stagingId = dups.body.data[0].Staging_ID;

  const resolve = await request(app).post(`/api/migrations/${migrationId}/duplicates/resolve`).set(saAuth()).send({ stagingIds: [stagingId], action: 'UseExisting' });
  expect(resolve.status).toBe(200);
  expect(resolve.body.data.updated).toBe(1);

  const row = await db('migration_staging_records').where('Staging_ID', stagingId).first();
  expect(row.Duplicate_Action).toBe('UseExisting');
});

test('an invalid duplicate resolution action is rejected', async () => {
  const res = await request(app).post(`/api/migrations/${migrationId}/duplicates/resolve`).set(saAuth()).send({ stagingIds: [1], action: 'NotARealAction' });
  expect(res.status).toBe(422);
});
