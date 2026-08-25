/**
 * Super Admin payment-gateway config management
 * (GET/PUT /api/super-admin/tenant/:id/payment-gateway) — the only way a
 * tenant's real Razorpay/PhonePe credentials get into
 * tbl_payment_gateway_config today. Key_Secret must never be readable
 * back through the API, only a masked last-4 hint.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, saToken, saUserId;
const saAuth = () => ({ Authorization: `Bearer ${saToken}` });

const SA_USERNAME = 'qatest_sa_pgconfig';
const SA_PASSWORD = 'QaTestSA@2026pg';

beforeAll(async () => {
  tenant = await testTenant.setup();

  const role = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(SA_PASSWORD, salt);
  const [saUser] = await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_USERNAME, Password_Hash: hash, Password_Salt: salt,
    Role_ID: role.Role_ID, Full_Name: 'QA Test SA PG Config', Is_Active: true, Is_Admin: true,
    Created_By: 'test',
  }).returning('*');
  saUserId = saUser.User_ID;

  const saRes = await request(app).post('/api/auth/login').send({ username: SA_USERNAME, password: SA_PASSWORD, tenantId: 'SA_MASTER' });
  saToken = saRes.body.data.token;
});

afterAll(async () => {
  await db('tbl_payment_gateway_config').where({ Tenant_ID: tenant.tenantId }).del();
  if (saUserId) await db('tbl_user_master').where({ User_ID: saUserId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('GET returns a virtual (unsaved) razorpay entry before anything is configured, with its webhook URL', async () => {
  const res = await request(app).get(`/api/super-admin/tenant/${tenant.tenantId}/payment-gateway`).set(saAuth());
  expect(res.status).toBe(200);
  expect(res.body.data).toHaveLength(1);
  const [virtual] = res.body.data;
  expect(virtual.configId).toBeNull();
  expect(virtual.gateway).toBe('razorpay');
  expect(virtual.keyId).toBeNull();
  expect(virtual.webhookUrl).toContain(`/api/webhooks/razorpay/${tenant.tenantId}`);
});

test('PUT creates a new gateway config; the response never contains the raw secret', async () => {
  const res = await request(app).put(`/api/super-admin/tenant/${tenant.tenantId}/payment-gateway`).set(saAuth()).send({
    gateway: 'razorpay', keyId: 'rzp_test_ABCDEFGH', keySecret: 'super_secret_value_123', environment: 'test', isActive: true,
  });
  expect(res.status).toBe(200);
  expect(res.body.data.keyId).toBe('rzp_test_ABCDEFGH');
  expect(res.body.data.keySecretMasked).toBe('••••_123');
  expect(JSON.stringify(res.body)).not.toContain('super_secret_value_123');

  const row = await db('tbl_payment_gateway_config').where({ Tenant_ID: tenant.tenantId, Gateway: 'razorpay' }).first();
  expect(row.Key_Secret).toBe('super_secret_value_123'); // stored correctly server-side
});

test('GET lists the configured gateway with a masked secret', async () => {
  const res = await request(app).get(`/api/super-admin/tenant/${tenant.tenantId}/payment-gateway`).set(saAuth());
  expect(res.status).toBe(200);
  expect(res.body.data).toHaveLength(1);
  expect(res.body.data[0].gateway).toBe('razorpay');
  expect(res.body.data[0].keySecretMasked).toBe('••••_123');
});

test('PUT without keySecret updates other fields without clobbering the stored secret', async () => {
  const res = await request(app).put(`/api/super-admin/tenant/${tenant.tenantId}/payment-gateway`).set(saAuth()).send({
    gateway: 'razorpay', isActive: false,
  });
  expect(res.status).toBe(200);
  expect(res.body.data.isActive).toBe(false);

  const row = await db('tbl_payment_gateway_config').where({ Tenant_ID: tenant.tenantId, Gateway: 'razorpay' }).first();
  expect(row.Key_Secret).toBe('super_secret_value_123'); // unchanged
});

test('webhookSecret is masked in every response and never appears raw', async () => {
  const res = await request(app).put(`/api/super-admin/tenant/${tenant.tenantId}/payment-gateway`).set(saAuth()).send({
    gateway: 'razorpay', webhookSecret: 'whsec_super_secret_456',
  });
  expect(res.status).toBe(200);
  expect(res.body.data.webhookSecretMasked).toBe('••••_456');
  expect(JSON.stringify(res.body)).not.toContain('whsec_super_secret_456');

  const row = await db('tbl_payment_gateway_config').where({ Tenant_ID: tenant.tenantId, Gateway: 'razorpay' }).first();
  expect(row.Webhook_Secret).toBe('whsec_super_secret_456');

  // Omitting it on a later PUT must not clobber it.
  const res2 = await request(app).put(`/api/super-admin/tenant/${tenant.tenantId}/payment-gateway`).set(saAuth()).send({
    gateway: 'razorpay', isActive: true,
  });
  const row2 = await db('tbl_payment_gateway_config').where({ Tenant_ID: tenant.tenantId, Gateway: 'razorpay' }).first();
  expect(row2.Webhook_Secret).toBe('whsec_super_secret_456');
});

test('a non-Super-Admin cannot read or write gateway config', async () => {
  const tenantLogin = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  const staffToken = tenantLogin.body.data.token;

  const getRes = await request(app).get(`/api/super-admin/tenant/${tenant.tenantId}/payment-gateway`)
    .set({ Authorization: `Bearer ${staffToken}` });
  expect(getRes.status).toBe(403);

  const putRes = await request(app).put(`/api/super-admin/tenant/${tenant.tenantId}/payment-gateway`)
    .set({ Authorization: `Bearer ${staffToken}` }).send({ gateway: 'razorpay', keyId: 'x' });
  expect(putRes.status).toBe(403);
});
