/**
 * Gold Rate — the pricing foundation every sale, purchase, and stock
 * valuation in the app reads from, and it had zero test coverage despite
 * that. Per-tenant, one row per calendar day (Rate_Date), upserted on a
 * second /set call the same day rather than duplicated.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, branchA, branchB;
const auth = (branchId) => ({ Authorization: `Bearer ${token}`, ...(branchId ? { 'X-Branch-ID': branchId } : {}) });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  branchA = `${tenant.tenantId}_GRA`;
  branchB = `${tenant.tenantId}_GRB`;
  await db('tbl_branch_master').insert([
    { Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Gold Rate Branch A', Branch_Code: 'GRA', Is_Active: true },
    { Branch_ID: branchB, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Gold Rate Branch B', Branch_Code: 'GRB', Is_Active: true },
  ]);
});

afterAll(async () => {
  await db('tbl_tenant_rates').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_branch_master').whereIn('Branch_ID', [branchA, branchB]).del();
  await testTenant.teardown();
  await db.destroy();
});

test('GET /live returns sensible built-in defaults before any rate is ever set — never crashes the app', async () => {
  const res = await request(app).get('/api/gold-rate/live').set(auth());
  expect(res.status).toBe(200);
  expect(res.body.data.rate_22k).toBe(6250);
  expect(res.body.data.source).toBe('default');
});

test('POST /set requires rate_22k', async () => {
  const res = await request(app).post('/api/gold-rate/set').set(auth()).send({});
  expect(res.status).toBe(400);
});

test('POST /set rejects a user with zero real operational permissions', async () => {
  // Previously ungated beyond plain login — any authenticated user,
  // even one with no billing/inventory/accounts/tenant_management
  // permission at all, could change the tenant's live rate.
  const [role] = await db('tbl_role_master').insert({
    Role_Name: 'QA No-Permission Role', Permissions: JSON.stringify({}), Is_Active: true,
  }).returning('*');
  const [noPermUser] = await db('tbl_user_master').insert({
    Tenant_ID: tenant.tenantId, Username: 'qa_no_perm_user',
    Password_Hash: bcrypt.hashSync('QaNoPerm@2026', 10), Password_Salt: 'x',
    Role_ID: role.Role_ID, Full_Name: 'QA No Permission User', Is_Active: true, All_Branch_Access: true,
  }).returning('*');
  const login = await request(app).post('/api/auth/login').send({ username: 'qa_no_perm_user', password: 'QaNoPerm@2026', tenantId: tenant.tenantId });
  const noPermToken = login.body.data.token;

  const res = await request(app).post('/api/gold-rate/set').set({ Authorization: `Bearer ${noPermToken}` }).send({ rate_22k: 6500 });
  expect(res.status).toBe(403);

  await db('tbl_user_master').where({ User_ID: noPermUser.User_ID }).del();
  await db('tbl_role_master').where({ Role_ID: role.Role_ID }).del();
});

test('POST /set creates today\'s rate and auto-derives 24K/18K/14K/Silver 999 from the 22K rate when not given explicitly', async () => {
  const res = await request(app).post('/api/gold-rate/set').set(auth()).send({ rate_22k: 6300, rate_silver: 85 });
  expect(res.status).toBe(200);
  expect(parseFloat(res.body.data.Rate_22K)).toBe(6300);
  expect(parseFloat(res.body.data.Rate_24K)).toBeCloseTo(6300 * 1.0968, 1);
  expect(parseFloat(res.body.data.Rate_18K)).toBeCloseTo(6300 * 0.75, 1);
  expect(parseFloat(res.body.data.Rate_14K)).toBeCloseTo(6300 * 0.5833, 1);
  expect(parseFloat(res.body.data.Rate_Silver_925)).toBe(85);
  expect(parseFloat(res.body.data.Rate_Silver_999)).toBeCloseTo(85 * 1.08, 1);
  expect(res.body.data.Set_By).toBe(tenant.username);
  expect(res.body.data.Source).toBe('Manual');
});

test('GET /live now returns the real saved rate, not the default', async () => {
  const res = await request(app).get('/api/gold-rate/live').set(auth());
  expect(res.status).toBe(200);
  expect(res.body.data.rate_22k).toBe(6300);
  expect(res.body.data.source).toBe('Manual');
});

test('a second POST /set the SAME day updates (upserts) the existing row instead of creating a duplicate', async () => {
  await request(app).post('/api/gold-rate/set').set(auth()).send({ rate_22k: 6400 });

  const rows = await db('tbl_tenant_rates').where({ Tenant_ID: tenant.tenantId, Rate_Date: dayjs().format('YYYY-MM-DD') });
  expect(rows.length).toBe(1); // still exactly one row for today, not two
  expect(parseFloat(rows[0].Rate_22K)).toBe(6400);
});

test('GET /history returns this tenant\'s rates, most recent first', async () => {
  const res = await request(app).get('/api/gold-rate/history').set(auth());
  expect(res.status).toBe(200);
  expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  expect(parseFloat(res.body.data[0].Rate_22K)).toBe(6400);
});

test('rates are tenant-isolated — a second tenant never sees the first tenant\'s rate as their own "today"', async () => {
  const saRole = await db('tbl_role_master').where({ Role_Name: 'Client Admin' }).first();
  const otherTenantId = 'QAT_GOLDRATE2';
  await db('tbl_tenant_master').where({ Tenant_ID: otherTenantId }).del();
  await db('tbl_tenant_master').insert({
    Tenant_ID: otherTenantId, Company_Name: 'QA Other Tenant', Brand_Code: 'QAO',
    License_Key: `QAO-${Date.now()}`, License_Expiry_Date: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    Business_Type: 'HYBRID', Is_Active: true,
  });
  const salt = bcrypt.genSaltSync(10);
  await db('tbl_user_master').insert({
    Tenant_ID: otherTenantId, Username: 'qatest_goldrate_other', Password_Hash: bcrypt.hashSync('irrelevant', salt), Password_Salt: salt,
    Role_ID: saRole.Role_ID, Full_Name: 'QA Other', Is_Active: true, Is_Admin: true,
  });
  const otherLogin = await request(app).post('/api/auth/login').send({ username: 'qatest_goldrate_other', password: 'irrelevant', tenantId: otherTenantId });
  const otherToken = otherLogin.body.data.token;

  try {
    const res = await request(app).get('/api/gold-rate/live').set({ Authorization: `Bearer ${otherToken}` });
    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('default'); // never sees the QATEST tenant's 6400 rate
    expect(res.body.data.rate_22k).not.toBe(6400);
  } finally {
    await db('tbl_user_master').where({ Tenant_ID: otherTenantId }).del();
    await db('tbl_tenant_master').where({ Tenant_ID: otherTenantId }).del();
  }
});

test('GET /all-tenants is Super Admin only', async () => {
  const res = await request(app).get('/api/gold-rate/all-tenants').set(auth());
  expect(res.status).toBe(403);
});

test('Super Admin\'s /all-tenants includes today\'s rate for this tenant', async () => {
  const saRole = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = bcrypt.genSaltSync(10);
  const SA_USERNAME = 'qa_temp_sa_goldratetest';
  await db('tbl_user_master').where({ Username: SA_USERNAME }).del();
  await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_USERNAME, Password_Hash: bcrypt.hashSync('TempSA@GoldT1', salt), Password_Salt: salt,
    Role_ID: saRole.Role_ID, Full_Name: 'QA Temp SA (gold rate test)', Is_Active: true, Is_Admin: true,
  });
  const saLogin = await request(app).post('/api/auth/login').send({ username: SA_USERNAME, password: 'TempSA@GoldT1', tenantId: 'SA_MASTER' });
  const saToken = saLogin.body.data.token;

  try {
    const res = await request(app).get('/api/gold-rate/all-tenants').set({ Authorization: `Bearer ${saToken}` });
    expect(res.status).toBe(200);
    const row = res.body.data.find(r => r.Tenant_ID === tenant.tenantId);
    expect(row).toBeDefined();
    expect(parseFloat(row.Rate_22K)).toBe(6400);
  } finally {
    await db('tbl_user_master').where({ Username: SA_USERNAME }).del();
  }
});

describe('Branch-level rates', () => {
  test('setting a rate with a branch selected does not touch the tenant-wide default', async () => {
    await request(app).post('/api/gold-rate/set').set(auth()).send({ rate_22k: 6000 }); // tenant-wide default
    const setBranchA = await request(app).post('/api/gold-rate/set').set(auth(branchA)).send({ rate_22k: 6600 });
    expect(setBranchA.status).toBe(200);
    expect(setBranchA.body.data.Branch_ID).toBe(branchA);

    const defaultAfter = await request(app).get('/api/gold-rate/live').set(auth()).send();
    expect(parseFloat(defaultAfter.body.data.rate_22k)).toBe(6000); // untouched by branch A's rate
    expect(defaultAfter.body.data.is_branch_specific).toBe(false);
  });

  test('GET /live with a branch selected returns that branch\'s own rate, not the tenant default', async () => {
    const res = await request(app).get('/api/gold-rate/live').set(auth(branchA)).send();
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.data.rate_22k)).toBe(6600);
    expect(res.body.data.is_branch_specific).toBe(true);
    expect(res.body.data.branch_id).toBe(branchA);
  });

  test('a branch with no rate of its own falls back to the tenant-wide default, not branch A\'s rate', async () => {
    const res = await request(app).get('/api/gold-rate/live').set(auth(branchB)).send();
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.data.rate_22k)).toBe(6000); // the tenant default, not 6600
    expect(res.body.data.is_branch_specific).toBe(false);
  });

  test('the "ALL" branch sentinel is never mistaken for a real branch id', async () => {
    const res = await request(app).get('/api/gold-rate/live').set(auth('ALL')).send();
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.data.rate_22k)).toBe(6000); // tenant default, not a query for Branch_ID='ALL'
    expect(res.body.data.is_branch_specific).toBe(false);
  });

  test('a second /set call for the same branch on the same day updates in place, not a duplicate row', async () => {
    await request(app).post('/api/gold-rate/set').set(auth(branchA)).send({ rate_22k: 6700 });
    const count = await db('tbl_tenant_rates').where({ Tenant_ID: tenant.tenantId, Branch_ID: branchA }).count('Rate_ID as c').first();
    expect(parseInt(count.c)).toBe(1);
  });
});
