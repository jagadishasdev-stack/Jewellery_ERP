/**
 * Per-tenant keyboard-shortcut overrides — a Super Admin remaps a
 * tenant's keys (server/src/routes/superAdmin.js), and every user of
 * that tenant then reads the resolved map via GET /api/tenant/shortcuts
 * (server/src/routes/tenant.js) with no per-user step needed.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, saToken, saUserId;
const auth = () => ({ Authorization: `Bearer ${token}` });
const saAuth = () => ({ Authorization: `Bearer ${saToken}` });

// A disposable, test-only Super Admin user — never the real superadmin
// account, whose actual current password isn't (and shouldn't be) known
// to this test. Created directly in SA_MASTER and deleted in afterAll,
// same isolation principle as testTenant's QATEST fixture.
const SA_TEST_USERNAME = 'qatest_sa_shortcuts';
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
  await db('tbl_tenant_shortcuts').where({ Tenant_ID: tenant.tenantId }).del();
  if (saUserId) await db('tbl_user_master').where({ User_ID: saUserId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('a tenant with no overrides gets the system defaults', async () => {
  const res = await request(app).get('/api/tenant/shortcuts').set(auth());
  expect(res.status).toBe(200);
  expect(res.body.data).toEqual({ save: 'F10', new: 'Alt+N', search: 'Ctrl+F', print: 'Ctrl+P', cancel: 'Escape', lookup: 'F2' });
});

test('a non-Super-Admin user cannot change shortcuts', async () => {
  const res = await request(app).put(`/api/super-admin/tenant/${tenant.tenantId}/shortcuts`).set(auth()).send({ overrides: { save: 'Ctrl+S' } });
  expect(res.status).toBe(403);
});

test('Super Admin can remap a tenant\'s shortcuts, and that tenant\'s users see the new keys', async () => {
  const put = await request(app).put(`/api/super-admin/tenant/${tenant.tenantId}/shortcuts`).set(saAuth()).send({
    overrides: { save: 'Ctrl+S', lookup: 'F3' },
  });
  expect(put.status).toBe(200);
  expect(put.body.data.save).toBe('Ctrl+S');
  expect(put.body.data.lookup).toBe('F3');
  expect(put.body.data.new).toBe('Alt+N'); // untouched action still falls back to default

  const mine = await request(app).get('/api/tenant/shortcuts').set(auth());
  expect(mine.status).toBe(200);
  expect(mine.body.data.save).toBe('Ctrl+S');
  expect(mine.body.data.lookup).toBe('F3');
  expect(mine.body.data.print).toBe('Ctrl+P');
});

test('rejects an unknown action name', async () => {
  const res = await request(app).put(`/api/super-admin/tenant/${tenant.tenantId}/shortcuts`).set(saAuth()).send({ overrides: { doTheThing: 'F5' } });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/Unknown action/);
});

test('rejects a malformed key combo', async () => {
  const res = await request(app).put(`/api/super-admin/tenant/${tenant.tenantId}/shortcuts`).set(saAuth()).send({ overrides: { save: '!!!not a combo!!!' } });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/Invalid key combo/);
});

test('Super Admin cannot remap shortcuts for a nonexistent tenant', async () => {
  const res = await request(app).put('/api/super-admin/tenant/NOPE_NOT_REAL/shortcuts').set(saAuth()).send({ overrides: { save: 'Ctrl+S' } });
  expect(res.status).toBe(404);
});
