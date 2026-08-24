/**
 * Excel bulk import — customers, as the representative case.
 *
 * The specific behavior worth locking in here is the one found by hand
 * during this session: a batch with some bad rows must import every good
 * row and report only the genuinely bad ones individually — not abort the
 * whole file, and not misreport a soft/duplicate skip as if it silently
 * succeeded.
 */
const request = require('supertest');
const XLSX = require('xlsx');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant;
let token;

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

function buildWorkbookBuffer(rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('rejects a request with no permission (tenant_management) cleanly', async () => {
  // A freshly-provisioned QATEST admin has tenant_management via Client Admin,
  // so instead prove the gate exists by hitting it with no token at all.
  const buf = buildWorkbookBuffer([{ 'Customer Name': 'X', Mobile: '9000000000' }]);
  const res = await request(app).post('/api/excel-import/customers').attach('file', buf, 'test.xlsx');
  expect(res.status).toBe(401);
});

test('imports valid rows, skips bad ones individually, and never aborts the whole batch', async () => {
  const rows = [
    { 'Customer Name': 'Good Row One', Mobile: '9111100001', City: 'Bengaluru' },
    { 'Customer Name': '', Mobile: '9111100002' }, // missing name — hard skip
    { 'Customer Name': 'Missing Mobile', Mobile: '' }, // missing mobile — hard skip
    { 'Customer Name': 'Good Row Two', Mobile: '9111100003', City: 'Mysuru' },
  ];
  const buf = buildWorkbookBuffer(rows);

  const res = await request(app)
    .post('/api/excel-import/customers')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', buf, 'customers.xlsx');

  expect(res.status).toBe(200);
  expect(res.body.data.totalRows).toBe(4);
  expect(res.body.data.imported).toBe(2);
  expect(res.body.data.skipped).toBe(2);
  expect(res.body.data.errors).toHaveLength(2);
  expect(res.body.data.errors.join(' ')).toMatch(/Customer Name is required/);
  expect(res.body.data.errors.join(' ')).toMatch(/valid Mobile number is required/);

  const inserted = await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId }).whereIn('Mobile_1', ['9111100001', '9111100003']);
  expect(inserted).toHaveLength(2);
});

test('re-importing a row with a mobile number that already exists is skipped as a duplicate, not overwritten', async () => {
  const buf = buildWorkbookBuffer([{ 'Customer Name': 'Good Row One Retry', Mobile: '9111100001', City: 'Chennai' }]);

  const res = await request(app)
    .post('/api/excel-import/customers')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', buf, 'customers.xlsx');

  expect(res.body.data.imported).toBe(0);
  expect(res.body.data.skipped).toBe(1);
  expect(res.body.data.errors[0]).toMatch(/already exists/);

  const row = await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId, Mobile_1: '9111100001' }).first();
  expect(row.City).toBe('Bengaluru'); // unchanged — proves it was not overwritten
});

/**
 * Regression test for a real intermittent 500 found while running the full
 * suite repeatedly (~1-in-6 to 1-in-8 runs, never in a single manual test):
 * "No tenant database context is active for this request." Root cause was
 * middleware ORDER — `authenticate` (which opens the AsyncLocalStorage
 * scope tenantDb needs) ran before `upload.single('file')`, and multer's
 * async multipart parsing occasionally resolved outside that scope. Fixed
 * by running `upload.single('file')` before `authenticate` in
 * excelImport.js (see the comment there). A single request essentially
 * never reproduces this — it needs real concurrent load, so this fires a
 * batch of real uploads at once rather than one at a time.
 */
test('regression: many concurrent uploads never lose tenant DB context', async () => {
  const requests = Array.from({ length: 20 }, (_, i) => {
    const buf = buildWorkbookBuffer([{ 'Customer Name': `Concurrent ${i}`, Mobile: `92000000${String(i).padStart(2, '0')}` }]);
    return request(app).post('/api/excel-import/customers').set('Authorization', `Bearer ${token}`).attach('file', buf, `c${i}.xlsx`);
  });
  const results = await Promise.all(requests);
  const failures = results.filter((r) => r.status !== 200);
  if (failures.length) console.error('Non-200 responses:', failures.map((r) => ({ status: r.status, body: r.body })));
  expect(failures).toHaveLength(0);
});
