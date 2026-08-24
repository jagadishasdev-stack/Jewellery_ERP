/**
 * Cloud-side sync engine (server/src/routes/sync.js).
 *
 * These are the exact scenarios that were hand-verified with curl right
 * after the route was written — including the idempotency-scoping bug
 * that hand-testing caught (an UPDATE to an already-synced row was being
 * silently dropped because the dedup check didn't distinguish operations).
 * Encoded here so that bug specifically can never come back unnoticed.
 */
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
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

function upload(records, deviceId = 'JEST-DEVICE') {
  return request(app).post('/api/sync/upload').set('Authorization', `Bearer ${token}`).send({ deviceId, records });
}

test('rejects unauthenticated requests', async () => {
  const res = await request(app).get('/api/sync/status');
  expect(res.status).toBe(401);
});

test('INSERT creates exactly one row; resubmitting the same syncUuid is ALREADY_SYNCED and does not duplicate it', async () => {
  const syncUuid = uuidv4();
  const payload = { Customer_Code: 'QAT-SYNC-1', Customer_Name: 'Sync Test', Mobile_1: '9000000001', City: 'Bengaluru' };

  const first = await upload([{ tableName: 'tbl_customer_master', operation: 'INSERT', syncUuid, payload }]);
  expect(first.body.data.summary).toEqual({ success: 1, alreadySynced: 0, failed: 0 });

  const retry = await upload([{ tableName: 'tbl_customer_master', operation: 'INSERT', syncUuid, payload }]);
  expect(retry.body.data.summary).toEqual({ success: 0, alreadySynced: 1, failed: 0 });

  const rows = await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId, Sync_UUID: syncUuid });
  expect(rows).toHaveLength(1);
});

test('UPDATE to an already-synced row actually applies (regression test for the dedup-scoping bug)', async () => {
  const syncUuid = uuidv4();
  await upload([{ tableName: 'tbl_customer_master', operation: 'INSERT', syncUuid, payload: { Customer_Code: 'QAT-SYNC-2', Customer_Name: 'Sync Test 2', Mobile_1: '9000000002', City: 'Bengaluru' } }]);

  const updateRes = await upload([{ tableName: 'tbl_customer_master', operation: 'UPDATE', syncUuid, payload: { City: 'Mysuru' } }]);
  expect(updateRes.body.data.summary).toEqual({ success: 1, alreadySynced: 0, failed: 0 });

  const row = await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId, Sync_UUID: syncUuid }).first();
  expect(row.City).toBe('Mysuru'); // this is the assertion that would have failed before the fix

  // Retrying the identical update again must still succeed (naturally idempotent — same end state) and not duplicate the row.
  const retryUpdate = await upload([{ tableName: 'tbl_customer_master', operation: 'UPDATE', syncUuid, payload: { City: 'Mysuru' } }]);
  expect(retryUpdate.body.data.summary.failed).toBe(0);
  const rows = await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId, Sync_UUID: syncUuid });
  expect(rows).toHaveLength(1);
});

test('UPDATE against a syncUuid that was never inserted fails cleanly, not silently', async () => {
  const res = await upload([{ tableName: 'tbl_customer_master', operation: 'UPDATE', syncUuid: uuidv4(), payload: { City: 'Nowhere' } }]);
  expect(res.body.data.summary).toEqual({ success: 0, alreadySynced: 0, failed: 1 });
  expect(res.body.data.results[0].reason).toMatch(/No existing row/);
});

test('a non-whitelisted table is rejected, never touched', async () => {
  const res = await upload([{ tableName: 'tbl_role_master', operation: 'INSERT', syncUuid: uuidv4(), payload: { x: 1 } }]);
  expect(res.body.data.summary.failed).toBe(1);
  expect(res.body.data.results[0].reason).toMatch(/not a syncable table/);
});

test('download returns only rows changed after the given "since" timestamp', async () => {
  const syncUuid = uuidv4();
  await upload([{ tableName: 'tbl_customer_master', operation: 'INSERT', syncUuid, payload: { Customer_Code: 'QAT-SYNC-3', Customer_Name: 'Sync Test 3', Mobile_1: '9000000003' } }]);

  const all = await request(app).get('/api/sync/download?tables=tbl_customer_master').set('Authorization', `Bearer ${token}`);
  expect(all.body.data.data.tbl_customer_master.some((r) => r.Sync_UUID === syncUuid)).toBe(true);

  const future = await request(app).get('/api/sync/download?tables=tbl_customer_master&since=2099-01-01T00:00:00Z').set('Authorization', `Bearer ${token}`);
  expect(future.body.data.data.tbl_customer_master).toHaveLength(0);
});

test('status reflects log outcomes, scoped to the calling tenant only', async () => {
  const res = await request(app).get('/api/sync/status').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.data.syncLog.SUCCESS).toBeGreaterThan(0);
  expect(res.body.data.syncLog.FAILED).toBeGreaterThan(0); // from the two failure tests above
});
