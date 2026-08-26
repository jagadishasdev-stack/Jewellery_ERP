/**
 * Supplier Payable only ever grew — Payment_Status was hardcoded 'Pending'
 * client-side, Balance_Amount/Amount_Paid were never actually computed at
 * creation (they sat at raw DB defaults regardless of the real total),
 * and no route anywhere could pay down a purchase's balance.
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

test('a purchase with no payment correctly shows the FULL balance outstanding, not zero', async () => {
  const res = await request(app).post('/api/purchase/create').set(auth()).send({
    Supplier_Name: 'QA Supplier Payment Test', Purchase_Date: '2026-08-25', Total_Amount: 40000, Subtotal_Amount: 40000,
    items: [{ Metal_Type: 'Gold', Gross_Weight: 5, Purchase_Rate: 40000, Article_Number: 'QASUPPAY-1' }],
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Payment_Status).toBe('Pending');
  expect(parseFloat(res.body.data.Balance_Amount)).toBe(40000); // NOT 0
  expect(parseFloat(res.body.data.Amount_Paid)).toBe(0);
});

test('paying down a purchase updates its balance/status and posts a real Dr Payable / Cr Cash journal', async () => {
  const create = await request(app).post('/api/purchase/create').set(auth()).send({
    Supplier_Name: 'QA Supplier Payment Test 2', Purchase_Date: '2026-08-25', Total_Amount: 25000, Subtotal_Amount: 25000,
    items: [{ Metal_Type: 'Gold', Gross_Weight: 3, Purchase_Rate: 25000, Article_Number: 'QASUPPAY-2' }],
  });
  const purchaseId = create.body.data.Purchase_ID;

  const partial = await request(app).post(`/api/purchase/${purchaseId}/pay-supplier`).set(auth()).send({ Amount: 10000, Payment_Mode: 'Cash' });
  expect(partial.status).toBe(201);
  expect(partial.body.data.Payment_Status).toBe('Partial');
  expect(parseFloat(partial.body.data.Balance_Amount)).toBe(15000);

  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Source_Type: 'PAYMENT' })
    .where('Reference', 'like', `${create.body.data.Purchase_Number}-PAY-%`).first();
  expect(journal).toBeDefined();
  const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });
  expect(entries.some((e) => e.Ledger_Account === 'Supplier Payable Account' && e.Entry_Type === 'Dr' && parseFloat(e.Amount) === 10000)).toBe(true);
  expect(entries.some((e) => e.Ledger_Account === 'Cash Account' && e.Entry_Type === 'Cr' && parseFloat(e.Amount) === 10000)).toBe(true);

  const final = await request(app).post(`/api/purchase/${purchaseId}/pay-supplier`).set(auth()).send({ Amount: 15000, Payment_Mode: 'Bank Transfer' });
  expect(final.status).toBe(201);
  expect(final.body.data.Payment_Status).toBe('Paid');
  expect(parseFloat(final.body.data.Balance_Amount)).toBe(0);
});

test('cannot pay more than the outstanding balance, or pay an already-Paid purchase', async () => {
  const create = await request(app).post('/api/purchase/create').set(auth()).send({
    Supplier_Name: 'QA Supplier Payment Test 3', Purchase_Date: '2026-08-25', Total_Amount: 5000, Subtotal_Amount: 5000,
    items: [{ Metal_Type: 'Gold', Gross_Weight: 1, Purchase_Rate: 5000, Article_Number: 'QASUPPAY-3' }],
  });
  const purchaseId = create.body.data.Purchase_ID;

  const overpay = await request(app).post(`/api/purchase/${purchaseId}/pay-supplier`).set(auth()).send({ Amount: 9000, Payment_Mode: 'Cash' });
  expect(overpay.status).toBe(400);
  expect(overpay.body.message).toMatch(/exceeds/);

  await request(app).post(`/api/purchase/${purchaseId}/pay-supplier`).set(auth()).send({ Amount: 5000, Payment_Mode: 'Cash' });
  const again = await request(app).post(`/api/purchase/${purchaseId}/pay-supplier`).set(auth()).send({ Amount: 100, Payment_Mode: 'Cash' });
  expect(again.status).toBe(400);
  expect(again.body.message).toMatch(/no outstanding balance/);
});
