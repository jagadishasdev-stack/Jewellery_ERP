/**
 * Data Migration Center — foundation layer: create -> upload (multi-file
 * + zip) -> analyze -> staging. Super-Admin-only, since this writes into
 * an arbitrary target tenant chosen from a list, the same gate every
 * other cross-tenant route in this codebase uses.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const AdmZip = require('adm-zip');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, saToken, tenantToken, saUserId, migrationId, migrationAuthToken;
// Every real /api/migrations/* route (besides verify-master itself) now
// also requires the short-lived X-Migration-Auth step-up token — see
// requireMigrationReauth in migrationShared.js.
const saAuth = () => ({ Authorization: `Bearer ${saToken}`, 'X-Migration-Auth': migrationAuthToken });
const tenantAuth = () => ({ Authorization: `Bearer ${tenantToken}` });

const SA_USERNAME = 'qatest_sa_migration';
const SA_PASSWORD = 'QaTestSA@2026mig';

function buildWorkbookBuffer(sheets) {
  // sheets: { sheetName: rows[] }
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildZipBuffer(files) {
  // files: { fileName: Buffer }
  const zip = new AdmZip();
  for (const [name, buf] of Object.entries(files)) zip.addFile(name, buf);
  return zip.toBuffer();
}

beforeAll(async () => {
  tenant = await testTenant.setup();

  const role = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(SA_PASSWORD, salt);
  const [saUser] = await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_USERNAME, Password_Hash: hash, Password_Salt: salt,
    Role_ID: role.Role_ID, Full_Name: 'QA Test SA (migration)', Is_Active: true, Is_Admin: true,
    Created_By: 'test',
  }).returning('*');
  saUserId = saUser.User_ID;

  const saRes = await request(app).post('/api/auth/login').send({ username: SA_USERNAME, password: SA_PASSWORD, tenantId: 'SA_MASTER' });
  saToken = saRes.body.data.token;

  const verify = await request(app).post('/api/migrations/verify-master').set({ Authorization: `Bearer ${saToken}` }).send({ username: SA_USERNAME, password: SA_PASSWORD });
  migrationAuthToken = verify.body.data.token;

  const tRes = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  tenantToken = tRes.body.data.token;
});

afterAll(async () => {
  if (migrationId) {
    await db('migration_staging_records').where('Migration_ID', migrationId).del();
    await db('migration_files').where('Migration_ID', migrationId).del();
    await db('migrations').where('Migration_ID', migrationId).del();
  }
  if (saUserId) await db('tbl_user_master').where({ User_ID: saUserId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('a non-Super-Admin (even a tenant\'s own admin) cannot create a migration for any tenant', async () => {
  const res = await request(app).post('/api/migrations').set(tenantAuth()).send({ Tenant_ID: tenant.tenantId, Migration_Type: 'Full' });
  expect(res.status).toBe(403);
});

test('an unauthenticated request is rejected before the Super Admin check even runs', async () => {
  const res = await request(app).post('/api/migrations').send({ Tenant_ID: tenant.tenantId, Migration_Type: 'Full' });
  expect(res.status).toBe(401);
});

test('a valid Super Admin session WITHOUT the step-up X-Migration-Auth token is still rejected', async () => {
  const res = await request(app).post('/api/migrations').set({ Authorization: `Bearer ${saToken}` }).send({ Tenant_ID: tenant.tenantId, Migration_Type: 'Full' });
  expect(res.status).toBe(401);
  expect(res.body.message).toMatch(/fresh Super Admin sign-in/);
});

test('verify-master rejects a wrong password, and rejects re-entering a DIFFERENT Super Admin account than the one currently logged in', async () => {
  const wrongPassword = await request(app).post('/api/migrations/verify-master').set({ Authorization: `Bearer ${saToken}` }).send({ username: SA_USERNAME, password: 'not the real password' });
  expect(wrongPassword.status).toBe(401);

  const differentAccount = await request(app).post('/api/migrations/verify-master').set({ Authorization: `Bearer ${saToken}` }).send({ username: 'some_other_admin', password: SA_PASSWORD });
  expect(differentAccount.status).toBe(403);
});

test('a tampered/forged X-Migration-Auth token is rejected even with a real Super Admin session', async () => {
  const res = await request(app).post('/api/migrations').set({ Authorization: `Bearer ${saToken}`, 'X-Migration-Auth': 'not-a-real-token' }).send({ Tenant_ID: tenant.tenantId, Migration_Type: 'Full' });
  expect(res.status).toBe(401);
});

test('the real verify-master token actually grants access to a protected route', async () => {
  expect(migrationAuthToken).toBeTruthy();
  const res = await request(app).get('/api/migrations').set(saAuth());
  expect(res.status).toBe(200);
});

test('Super Admin creates a migration for a real target tenant, starting in DRAFT', async () => {
  const res = await request(app).post('/api/migrations').set(saAuth()).send({ Tenant_ID: tenant.tenantId, Migration_Type: 'Full', Source_ERP: 'QA Legacy ERP' });
  expect(res.status).toBe(201);
  expect(res.body.data.Status).toBe('DRAFT');
  expect(res.body.data.Migration_ID).toMatch(/^MIG-\d{8}-\d{4}$/);
  migrationId = res.body.data.Migration_ID;
});

test('creating a migration for a nonexistent tenant is rejected', async () => {
  const res = await request(app).post('/api/migrations').set(saAuth()).send({ Tenant_ID: 'QA_NONEXISTENT_TENANT_XYZ', Migration_Type: 'Full' });
  expect(res.status).toBe(404);
});

test('analyze is rejected before any file has been uploaded (DRAFT -> requires UPLOADED)', async () => {
  const res = await request(app).post(`/api/migrations/${migrationId}/analyze`).set(saAuth()).send();
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/UPLOADED/);
});

test('uploading a multi-sheet .xlsx plus a .zip (containing another .xlsx) in one migration works, and flips status to UPLOADED', async () => {
  const xlsxBuffer = buildWorkbookBuffer({
    'Customer Master': [
      { CUSTOMER_NAME: 'QA Migration Customer 1', MOBILE_NO: '9800000001', GSTIN: '29ABCDE1234F1Z5', ADDRESS: 'MG Road', CITY: 'Bengaluru' },
      { CUSTOMER_NAME: 'QA Migration Customer 2', MOBILE_NO: '9800000002', GSTIN: '', ADDRESS: 'Church Street', CITY: 'Bengaluru' },
    ],
    'Item Master': [
      { ITEM_CODE: 'QAMIG-ITEM-1', GROSS_WT: 10.5, NET_WT: 9.8, STONE_WT: 0.2, PURCHASE_RATE: 55000 },
    ],
  });
  const zippedXlsx = buildWorkbookBuffer({
    'Supplier': [{ VENDOR_NAME: 'QA Migration Supplier 1', MOBILE_NO: '9800000099', GSTIN: '29XYZAB5678C1Z9' }],
  });
  const zipBuffer = buildZipBuffer({ 'suppliers.xlsx': zippedXlsx });

  const res = await request(app).post(`/api/migrations/${migrationId}/files`).set(saAuth())
    .attach('files', xlsxBuffer, 'customers_and_items.xlsx')
    .attach('files', zipBuffer, 'bundle.zip');

  expect(res.status).toBe(201);
  expect(res.body.data.length).toBe(2);

  const migration = await request(app).get(`/api/migrations/${migrationId}`).set(saAuth());
  expect(migration.body.data.Status).toBe('UPLOADED');
  expect(migration.body.data.files.length).toBe(2);
});

test('analyze detects every sheet\'s entity type (including one nested inside the zip) and stages every row', async () => {
  const res = await request(app).post(`/api/migrations/${migrationId}/analyze`).set(saAuth()).send();
  expect(res.status).toBe(200);
  expect(res.body.data.sheets.length).toBe(3); // Customer Master + Item Master + the zip's Supplier sheet

  const byName = Object.fromEntries(res.body.data.sheets.map((s) => [s.sheetName, s]));
  expect(byName['Customer Master'].detectedEntity).toBe('customer');
  expect(byName['Customer Master'].rowCount).toBe(2);
  expect(byName['Item Master'].detectedEntity).toBe('product');
  expect(byName['Supplier'].detectedEntity).toBe('vendor'); // proves the zip's inner file was genuinely parsed, not skipped

  expect(res.body.data.totalRecords).toBe(4); // 2 customers + 1 product + 1 supplier

  const staged = await db('migration_staging_records').where('Migration_ID', migrationId);
  expect(staged.length).toBe(4);
  expect(staged.every((s) => s.Raw_Data)).toBe(true);

  const migration = await request(app).get(`/api/migrations/${migrationId}`).set(saAuth());
  expect(migration.body.data.Status).toBe('MAPPING');
  expect(migration.body.data.Total_Records).toBe(4);
});

test('once analysis completes (status is now MAPPING), a second analyze call is rejected rather than silently re-staging over an in-progress mapping review', async () => {
  const res = await request(app).post(`/api/migrations/${migrationId}/analyze`).set(saAuth()).send();
  expect(res.status).toBe(400);
  const staged = await db('migration_staging_records').where('Migration_ID', migrationId);
  expect(staged.length).toBe(4); // untouched — the rejected call never reached the re-stage logic
});

test('GET /:id/analysis summarizes staged rows without re-parsing the files', async () => {
  const res = await request(app).get(`/api/migrations/${migrationId}/analysis`).set(saAuth());
  expect(res.status).toBe(200);
  const total = res.body.data.reduce((s, r) => s + r.row_count, 0);
  expect(total).toBe(4);
  expect(res.body.data.some((r) => r.Entity_Type === 'customer' && r.row_count === 2)).toBe(true);
});

test('GET /api/migrations dashboard list includes this migration with a per-status count', async () => {
  const res = await request(app).get('/api/migrations').set(saAuth());
  expect(res.status).toBe(200);
  expect(res.body.data.migrations.some((m) => m.Migration_ID === migrationId)).toBe(true);
  expect(res.body.data.counts.MAPPING).toBeGreaterThanOrEqual(1);
});
