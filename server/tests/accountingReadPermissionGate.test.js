/**
 * The accounting book/report GET routes (chart-of-accounts, ledger,
 * trial-balance, day-book, cash-book, bank-book, profit-loss,
 * balance-sheet, dashboard, vouchers) were only ever gated on the client
 * side (ProtectedRoute permission="accounts") — the API itself accepted
 * any authenticated user's token regardless of role, so a Billing
 * Operator (or any staff login) could read the full books directly.
 * Confirms every one of those routes now requires the 'accounts'
 * permission server-side too.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, adminToken, staffToken, roleId;

beforeAll(async () => {
  tenant = await testTenant.setup();
  const adminLogin = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  adminToken = adminLogin.body.data.token;

  // A role with no 'accounts' permission at all. Role_Name is unique
  // globally (roles have no Tenant_ID column) and QATEST is a fixed
  // tenant ID reused by every run, so a crashed prior run of this file
  // can leave this exact role name behind — clear it first, same
  // self-healing pattern testTenant.teardown() itself uses.
  const ROLE_NAME = 'QA No-Accounts Staff';
  await db('tbl_role_master').where({ Role_Name: ROLE_NAME }).del();
  const roleRes = await request(app).post('/api/tenant/roles').set({ Authorization: `Bearer ${adminToken}` }).send({
    Role_Name: ROLE_NAME,
    Permissions: { inventory: true, billing: true },
  });
  expect(roleRes.status).toBe(201);
  roleId = roleRes.body.data.Role_ID;
  const staffRes = await request(app).post('/api/tenant/users').set({ Authorization: `Bearer ${adminToken}` }).send({
    Username: `${tenant.username}_noacc`, Password: 'Passw0rd!123', Full_Name: 'QA No Accounts Staff', Role_ID: roleId,
  });
  expect(staffRes.status).toBe(201);
  const staffLogin = await request(app).post('/api/auth/login').send({ username: `${tenant.username}_noacc`, password: 'Passw0rd!123', tenantId: tenant.tenantId });
  staffToken = staffLogin.body.data.token;
});

afterAll(async () => {
  await testTenant.teardown();
  if (roleId) await db('tbl_role_master').where({ Role_ID: roleId }).del();
  await db.destroy();
});

const ROUTES = [
  ['get', '/api/accounting/chart-of-accounts'],
  ['get', '/api/accounting/trial-balance'],
  ['get', '/api/accounting/day-book'],
  ['get', '/api/accounting/cash-book'],
  ['get', '/api/accounting/bank-book'],
  ['get', '/api/accounting/profit-loss'],
  ['get', '/api/accounting/balance-sheet'],
  ['get', '/api/accounting/dashboard'],
  ['get', '/api/accounting/vouchers'],
];

for (const [method, path] of ROUTES) {
  test(`${method.toUpperCase()} ${path} is blocked for a user without 'accounts' permission`, async () => {
    const res = await request(app)[method](path).set({ Authorization: `Bearer ${staffToken}` });
    expect(res.status).toBe(403);
  });

  test(`${method.toUpperCase()} ${path} still works for a user with 'accounts' permission`, async () => {
    const res = await request(app)[method](path).set({ Authorization: `Bearer ${adminToken}` });
    expect(res.status).toBe(200);
  });
}

test('GET /api/accounting/ledger/:accountId is blocked for a user without accounts permission', async () => {
  const coa = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenant.tenantId }).first();
  const blocked = await request(app).get(`/api/accounting/ledger/${coa.Account_ID}`).set({ Authorization: `Bearer ${staffToken}` });
  expect(blocked.status).toBe(403);
  const allowed = await request(app).get(`/api/accounting/ledger/${coa.Account_ID}`).set({ Authorization: `Bearer ${adminToken}` });
  expect(allowed.status).toBe(200);
});
