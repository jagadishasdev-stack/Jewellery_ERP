/**
 * AMC/license enforcement — deactivating a tenant (or letting its license
 * lapse) must lock out an ALREADY-LOGGED-IN session on its very next
 * request, not just block future logins. Before this, `authenticate`
 * never re-checked Is_Active/License_Expiry_Date after the JWT was
 * issued, so a tenant deactivated mid-session could keep working,
 * fully authenticated, until their token happened to expire (up to 24h).
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');
const { invalidateTenantStatus } = require('../src/middleware/auth');

let tenant, token, saToken, saUserId;
const auth = () => ({ Authorization: `Bearer ${token}` });
const saAuth = () => ({ Authorization: `Bearer ${saToken}` });

const SA_TEST_USERNAME = 'qatest_sa_lockout';
const SA_TEST_PASSWORD = 'QaTestSA@2026';

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  const role = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(SA_TEST_PASSWORD, salt);
  const [saUser] = await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_TEST_USERNAME, Password_Hash: hash, Password_Salt: salt,
    Role_ID: role.Role_ID, Full_Name: 'QA Test Super Admin', Is_Active: true, Is_Admin: true,
    Created_By: 'test',
  }).returning('*');
  saUserId = saUser.User_ID;

  const saRes = await request(app).post('/api/auth/login').send({ username: SA_TEST_USERNAME, password: SA_TEST_PASSWORD, tenantId: 'SA_MASTER' });
  saToken = saRes.body.data.token;
});

afterAll(async () => {
  // Always leave the tenant re-activated even if an assertion above failed.
  await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).update({ Is_Active: true });
  if (saUserId) await db('tbl_user_master').where({ User_ID: saUserId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('an already-issued token still works while the tenant is active', async () => {
  const res = await request(app).get('/api/ornaments').set(auth());
  expect(res.status).not.toBe(403);
});

test('deactivating the tenant locks out the SAME already-issued token on its very next request — no re-login involved', async () => {
  const deactivate = await request(app).put(`/api/super-admin/tenant/${tenant.tenantId}/settings`).set(saAuth()).send({ Is_Active: false });
  expect(deactivate.status).toBe(200);

  const res = await request(app).get('/api/ornaments').set(auth());
  expect(res.status).toBe(403);
  expect(res.body.message).toMatch(/inactive/i);
});

test('reactivating restores access for that same token immediately', async () => {
  const reactivate = await request(app).put(`/api/super-admin/tenant/${tenant.tenantId}/settings`).set(saAuth()).send({ Is_Active: true });
  expect(reactivate.status).toBe(200);

  const res = await request(app).get('/api/ornaments').set(auth());
  expect(res.status).not.toBe(403);
});

test('an expired license locks out non-Super-Admin roles but the check exempts the Super Admin role itself', async () => {
  await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).update({ License_Expiry_Date: '2020-01-01' });
  // Direct DB update, not the /settings route — bust the cache by hand so
  // this test isn't just re-testing the invalidation the other tests
  // already cover; it's specifically testing the expiry-date comparison.
  invalidateTenantStatus(tenant.tenantId);

  const res = await request(app).get('/api/ornaments').set(auth());
  expect(res.status).toBe(403);
  expect(res.body.message).toMatch(/license expired/i);

  // Super Admin's own token must never be blocked by a license-expiry check.
  const saRes = await request(app).get('/api/super-admin/dashboard').set(saAuth());
  expect(saRes.status).not.toBe(403);

  // Restore for other tests / afterAll.
  await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).update({ License_Expiry_Date: '2030-01-01' });
  invalidateTenantStatus(tenant.tenantId);
});
