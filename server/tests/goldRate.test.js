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

let tenant, token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  await db('tbl_tenant_rates').where({ Tenant_ID: tenant.tenantId }).del();
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
