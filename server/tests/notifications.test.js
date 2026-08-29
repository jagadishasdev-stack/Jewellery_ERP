/**
 * GET /api/notifications/summary — previously didn't exist at all (the
 * header's Bell icon was a dead placeholder, Badge count={0} always).
 * Reuses real data already in each module rather than a new event system.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  await db('tbl_bin_orders').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

// testTenant reuses a single shared 'QATEST' tenant across the whole test
// suite (not a fresh one per file) — so counts can never be assumed to
// start at zero here. Every assertion below measures the DELTA this test
// itself caused, the same discipline other files in this suite use.
test('a new Pending Order Bin entry increases pendingCustomerOrder by exactly 1; a Delivered one does not', async () => {
  const before = await request(app).get('/api/notifications/summary').set(auth());
  const beforeCount = before.body.data.counts.pendingCustomerOrder;

  await db('tbl_bin_orders').insert({ Tenant_ID: tenant.tenantId, Voucher_ID: 'QANOTIF-ORD-1', Order_Date: '2026-08-29', Party_Name: 'QA Notif Customer', Status: 'Pending' });
  const afterPending = await request(app).get('/api/notifications/summary').set(auth());
  expect(afterPending.body.data.counts.pendingCustomerOrder).toBe(beforeCount + 1);

  await db('tbl_bin_orders').insert({ Tenant_ID: tenant.tenantId, Voucher_ID: 'QANOTIF-ORD-2', Order_Date: '2026-08-29', Party_Name: 'QA Notif Customer 2', Status: 'Delivered' });
  const afterDelivered = await request(app).get('/api/notifications/summary').set(auth());
  expect(afterDelivered.body.data.counts.pendingCustomerOrder).toBe(beforeCount + 1); // Delivered doesn't count
});

test('total is the sum of every category', async () => {
  const res = await request(app).get('/api/notifications/summary').set(auth());
  const sum = Object.values(res.body.data.counts).reduce((s, n) => s + n, 0);
  expect(res.body.data.total).toBe(sum);
});
