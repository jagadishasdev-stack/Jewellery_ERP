/**
 * Order Bin — the advance collected at booking used to vanish entirely:
 * the client's Order Booking form posted to /order (a route that has
 * never existed), and the form's own onFinish didn't even call that
 * mutation — it went straight to printing a card. No DB row, no ledger
 * entry, real cash silently unrecorded. Now the client saves to the real
 * POST /api/bin/orders, and that route itself posts the advance to the
 * ledger (this whole file previously had zero postJournal calls at all).
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

test('POST /api/bin/orders with an advance posts a real, balanced Dr Cash / Cr Customer Advance journal', async () => {
  const res = await request(app).post('/api/bin/orders').set(auth()).send({
    Party_Name: 'QA Order Customer', Party_Mobile: '9998887771', Order_Type: 'Customer',
    Order_Date: '2026-08-20', Item_Description: 'Gold necklace, 22K, approx 25g',
    Estimated_Amount: 150000, Advance_Amount: 25000, Payment_Mode: 'Cash',
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Advance_Amount).toBe('25000.00');

  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: res.body.data.Voucher_ID }).first();
  expect(journal).toBeDefined();
  const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });
  const dr = entries.find((e) => e.Entry_Type === 'Dr');
  const cr = entries.find((e) => e.Entry_Type === 'Cr');
  expect(parseFloat(dr.Amount)).toBe(25000);
  expect(parseFloat(cr.Amount)).toBe(25000);
  expect(parseFloat(dr.Amount)).toBe(parseFloat(cr.Amount)); // balanced

  const advanceAccount = await db('tbl_chart_of_accounts').where({ Account_ID: cr.Account_ID }).first();
  expect(advanceAccount.Account_Name).toBe('Customer Advance Account');
});

test('POST /api/bin/orders with no advance posts no journal at all (nothing to record)', async () => {
  const res = await request(app).post('/api/bin/orders').set(auth()).send({
    Party_Name: 'QA No-Advance Customer', Party_Mobile: '9998887772', Order_Type: 'Customer',
    Order_Date: '2026-08-20', Item_Description: 'Silver anklet',
    Estimated_Amount: 5000, Advance_Amount: 0,
  });
  expect(res.status).toBe(201);
  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: res.body.data.Voucher_ID }).first();
  expect(journal).toBeUndefined();
});
