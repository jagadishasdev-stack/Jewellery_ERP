/**
 * Per-tenant document-number format toggle (tbl_tenant_master.
 * Short_Number_Format, server/src/utils/numberFormat.js). Default OFF
 * keeps every existing generator's exact prior output
 * (PREFIX-TENANTCODE-YYYYMMDD-SEQ); a Super Admin can switch a tenant to
 * the shorter PREFIX-SEQ shape via PUT /api/super-admin/tenant/:id/settings.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, saToken, saUserId, typeId;
const auth = () => ({ Authorization: `Bearer ${token}` });
const saAuth = () => ({ Authorization: `Bearer ${saToken}` });

const SA_TEST_USERNAME = 'qatest_sa_numberformat';
const SA_TEST_PASSWORD = 'QaTestSA@2026';

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

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
  await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).update({ Short_Number_Format: false });
  if (saUserId) await db('tbl_user_master').where({ User_ID: saUserId }).del();
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(overrides = {}) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 28000, ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.data;
}

test('defaults to OFF — Article_Number keeps the full PREFIX-TENANTCODE-DATE-SEQ shape', async () => {
  const o = await createOrnament();
  expect(o.Article_Number).toMatch(/^ART-QATEST-\d{8}-\d{5}$/);
});

test('Super Admin can flip a tenant to Short Number Format via PUT settings', async () => {
  const res = await request(app).put(`/api/super-admin/tenant/${tenant.tenantId}/settings`).set(saAuth())
    .send({ Short_Number_Format: true });
  expect(res.status).toBe(200);
  expect(res.body.data.Short_Number_Format).toBe(true);
});

test('once ON, newly generated Article_Number and Invoice_Number drop the tenant code and date', async () => {
  const o = await createOrnament();
  expect(o.Article_Number).toMatch(/^ART-\d{5}$/);

  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: o.Ornament_ID, Article_Number: o.Article_Number, Total_Line_Price: 28000 }],
  });
  expect(sale.status).toBe(201);
  expect(sale.body.data.sale.Invoice_Number).toMatch(/^INV-\d{4}$/);
});

test('short-format sequence keeps climbing across multiple creates (never resets, no date to reset on)', async () => {
  const a = await createOrnament();
  const b = await createOrnament();
  const seqA = parseInt(a.Article_Number.split('-')[1], 10);
  const seqB = parseInt(b.Article_Number.split('-')[1], 10);
  expect(seqB).toBe(seqA + 1);
});

test('turning it back OFF restores the full format for the next new number', async () => {
  const off = await request(app).put(`/api/super-admin/tenant/${tenant.tenantId}/settings`).set(saAuth())
    .send({ Short_Number_Format: false });
  expect(off.status).toBe(200);

  const o = await createOrnament();
  expect(o.Article_Number).toMatch(/^ART-QATEST-\d{8}-\d{5}$/);
});
