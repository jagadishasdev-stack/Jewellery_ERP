/**
 * The thermal receipt template has supported printing the shop's own
 * GSTIN since it was built ("GST: ..." line, thermalReceipt.js), but
 * /auth/login never actually returned it — both POSPage.jsx call sites
 * only ever had `user?.companyName` to pass in, so the GSTIN line never
 * appeared on a single printed receipt. Confirms login now returns it.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant;

beforeAll(async () => {
  tenant = await testTenant.setup();
  await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).update({ GST_No: '29ABCDE1234F1Z5' });
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

test('login returns the tenant\'s own GSTIN as gstNo', async () => {
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  expect(res.status).toBe(200);
  expect(res.body.data.user.gstNo).toBe('29ABCDE1234F1Z5');
  expect(res.body.data.user.companyName).toBeTruthy(); // unrelated pre-existing field still intact
});

test('a tenant with no GSTIN set returns gstNo: null, not undefined or a crash', async () => {
  await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).update({ GST_No: null });
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  expect(res.status).toBe(200);
  expect(res.body.data.user.gstNo).toBeNull();
});
