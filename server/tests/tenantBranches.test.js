/**
 * Branch deactivate/reactivate — GET /api/tenant/branches used to
 * hardcode Is_Active:true, so a deactivated branch became permanently
 * invisible with no way back through the UI. Covers: a normal branch
 * can be deactivated and reactivated, a non-SA/non-includeInactive
 * caller never sees inactive branches, and the Head Office branch
 * cannot be deactivated at all.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, saToken, saUserId, extraBranchId;
const saAuth = () => ({ Authorization: `Bearer ${saToken}` });

const SA_USERNAME = 'qatest_sa_branches';
const SA_PASSWORD = 'QaTestSA@2026branch';

beforeAll(async () => {
  tenant = await testTenant.setup();

  const role = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(SA_PASSWORD, salt);
  const [saUser] = await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_USERNAME, Password_Hash: hash, Password_Salt: salt,
    Role_ID: role.Role_ID, Full_Name: 'QA Test SA Branches', Is_Active: true, Is_Admin: true,
    Created_By: 'test',
  }).returning('*');
  saUserId = saUser.User_ID;

  const saRes = await request(app).post('/api/auth/login').send({ username: SA_USERNAME, password: SA_PASSWORD, tenantId: 'SA_MASTER' });
  saToken = saRes.body.data.token;

  const createRes = await request(app).post('/api/tenant/branches').set(saAuth()).send({
    tenantId: tenant.tenantId, branchName: 'QA Branch 2', city: 'Test City 2',
  });
  extraBranchId = createRes.body.data.Branch_ID;
});

afterAll(async () => {
  if (saUserId) await db('tbl_user_master').where({ User_ID: saUserId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('a normal (non-includeInactive) branch fetch never returns inactive branches', async () => {
  await request(app).put(`/api/tenant/branches/${extraBranchId}`).set(saAuth()).send({ isActive: false });

  const res = await request(app).get('/api/tenant/branches').set(saAuth()).query({ tenantId: tenant.tenantId });
  expect(res.status).toBe(200);
  expect(res.body.data.find((b) => b.Branch_ID === extraBranchId)).toBeUndefined();

  // Restore for the next tests.
  await request(app).put(`/api/tenant/branches/${extraBranchId}`).set(saAuth()).send({ isActive: true });
});

test('includeInactive=true (Super Admin) reveals a deactivated branch', async () => {
  await request(app).put(`/api/tenant/branches/${extraBranchId}`).set(saAuth()).send({ isActive: false });

  const res = await request(app).get('/api/tenant/branches').set(saAuth())
    .query({ tenantId: tenant.tenantId, includeInactive: 'true' });
  expect(res.status).toBe(200);
  const found = res.body.data.find((b) => b.Branch_ID === extraBranchId);
  expect(found).toBeTruthy();
  expect(found.Is_Active).toBe(false);
});

test('reactivating restores it to the normal (active-only) listing', async () => {
  const put = await request(app).put(`/api/tenant/branches/${extraBranchId}`).set(saAuth()).send({ isActive: true });
  expect(put.status).toBe(200);
  expect(put.body.data.Is_Active).toBe(true);

  const res = await request(app).get('/api/tenant/branches').set(saAuth()).query({ tenantId: tenant.tenantId });
  expect(res.body.data.find((b) => b.Branch_ID === extraBranchId)).toBeTruthy();
});

test('the Head Office branch cannot be deactivated', async () => {
  const res = await request(app).put(`/api/tenant/branches/${tenant.branchId}`).set(saAuth()).send({ isActive: false });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/head office/i);

  const branch = await db('tbl_branch_master').where({ Branch_ID: tenant.branchId }).first();
  expect(branch.Is_Active).toBe(true); // unchanged
});

test('a non-Super-Admin cannot request includeInactive (silently ignored, still active-only)', async () => {
  await request(app).put(`/api/tenant/branches/${extraBranchId}`).set(saAuth()).send({ isActive: false });

  const staffLogin = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  const staffToken = staffLogin.body.data.token;

  const res = await request(app).get('/api/tenant/branches')
    .set({ Authorization: `Bearer ${staffToken}` }).query({ includeInactive: 'true' });
  expect(res.status).toBe(200);
  expect(res.body.data.find((b) => b.Branch_ID === extraBranchId)).toBeUndefined();

  await request(app).put(`/api/tenant/branches/${extraBranchId}`).set(saAuth()).send({ isActive: true });
});
