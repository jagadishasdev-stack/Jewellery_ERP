/**
 * PUT /api/repair/:id used to blind-spread the whole request body into
 * the UPDATE — a caller could set Tenant_ID (moving the record to
 * another tenant), Balance_Due/Total_Charge directly (bypassing every
 * ledger posting those are supposed to only change through), or
 * Original_Karigar_ID (forging a repair-to-karigar link). Delivery could
 * also be posted repeatedly, re-adding to Advance_Paid each time.
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
  await testTenant.teardown();
  await db.destroy();
});

test('PUT /api/repair/:id ignores fields outside the allow-list — Tenant_ID/Advance_Paid/Original_Karigar_ID cannot be set directly', async () => {
  const create = await request(app).post('/api/repair').set(auth()).send({ Item_Description: 'QA Safety Ring' });
  const repairId = create.body.data.Repair_ID;

  const res = await request(app).put(`/api/repair/${repairId}`).set(auth()).send({
    Status: 'In-Progress', Tenant_ID: 'SOME_OTHER_TENANT', Advance_Paid: 999999, Original_Karigar_ID: 99999,
  });
  expect(res.status).toBe(200);
  expect(res.body.data.Status).toBe('In-Progress');
  expect(res.body.data.Tenant_ID).toBe(tenant.tenantId); // unchanged — ignored
  expect(parseFloat(res.body.data.Advance_Paid || 0)).not.toBe(999999); // unchanged — ignored, only /deliver may change this

  const row = await db('tbl_repair_orders').where({ Repair_ID: repairId }).first();
  expect(row.Tenant_ID).toBe(tenant.tenantId);
  expect(row.Original_Karigar_ID).toBeNull();
});

test('a repair cannot be delivered twice', async () => {
  const create = await request(app).post('/api/repair').set(auth()).send({ Item_Description: 'QA Double Deliver Ring', Total_Charge: 500 });
  const repairId = create.body.data.Repair_ID;

  const first = await request(app).post(`/api/repair/${repairId}/deliver`).set(auth()).send({ Final_Cost: 500, Payment_Mode: 'UPI' });
  expect(first.status).toBe(200);
  const second = await request(app).post(`/api/repair/${repairId}/deliver`).set(auth()).send({ Final_Cost: 500, Payment_Mode: 'Cash' });
  expect(second.status).toBe(400);
  expect(second.body.message).toMatch(/already been delivered/);
});

test('delivery posts to the ledger under the ACTUAL payment mode used, not always Cash', async () => {
  const create = await request(app).post('/api/repair').set(auth()).send({ Item_Description: 'QA UPI Delivery Ring', Total_Charge: 800 });
  const repairId = create.body.data.Repair_ID;
  const deliver = await request(app).post(`/api/repair/${repairId}/deliver`).set(auth()).send({ Final_Cost: 800, Payment_Mode: 'UPI' });
  expect(deliver.status).toBe(200);

  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: create.body.data.Job_Card_Number }).orderBy('Journal_ID', 'desc').first();
  const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });
  expect(entries.some((e) => e.Ledger_Account === 'UPI Clearing Account' && e.Entry_Type === 'Dr')).toBe(true);
});

test('a repair can be tagged with a Repair Category, and the list route returns its name via the join', async () => {
  const category = await request(app).post('/api/simple-masters/repair-category').set(auth()).send({ Category_Name: 'QA Sizing' });
  const categoryId = category.body.data.Category_ID;

  const create = await request(app).post('/api/repair').set(auth()).send({ Item_Description: 'QA Categorized Bangle', Category_ID: categoryId });
  expect(create.status).toBe(201);
  expect(create.body.data.Category_ID).toBe(categoryId);

  const list = await request(app).get('/api/repair').set(auth());
  const row = list.body.data.items.find((r) => r.Repair_ID === create.body.data.Repair_ID);
  expect(row.Category_Name).toBe('QA Sizing');
});
