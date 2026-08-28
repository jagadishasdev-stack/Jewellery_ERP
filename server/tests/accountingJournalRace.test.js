/**
 * postJournal() was fire-and-forget (no `await`) at several call sites —
 * dayClose.js, pawnbroking.js, repair.js, karigar.js — the same pattern
 * fixed in sales.js after tallyExport.test.js caught it concretely: the
 * HTTP response could go out before the journal insert was guaranteed
 * committed, so a report/export run immediately after could miss it.
 * Each test here does the real action then immediately queries
 * tbl_accounting_journal — no waiting, no retry — proving the journal is
 * already there by the time the response comes back.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');
const dayjs = require('dayjs');

let tenant, token, customerId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  const customer = await request(app).post('/api/customers').set(auth()).send({
    Customer_Name: 'QA Journal Race Customer', Mobile_1: '9000000099',
  });
  customerId = customer.body.data.Customer_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

async function latestJournal(reference) {
  return db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: reference }).first();
}

test('POST /api/pawnbroking/loans posts its disbursement journal before the response returns', async () => {
  const res = await request(app).post('/api/pawnbroking/loans').set(auth()).send({
    Customer_ID: customerId, Loan_Date: dayjs().format('YYYY-MM-DD'),
    Loan_Amount: 50000, Interest_Rate_Pct: 2,
    items: [{ Item_Description: 'Gold Chain', Gross_Weight: 20, Net_Weight: 18 }],
  });
  expect(res.status).toBe(201);

  const journal = await latestJournal(res.body.data.Loan_Number);
  expect(journal).toBeDefined();
  const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });
  expect(entries.length).toBe(2);
});

test('POST /api/pawnbroking/loans/:id/transactions posts its journal before the response returns', async () => {
  const loan = await request(app).post('/api/pawnbroking/loans').set(auth()).send({
    Customer_ID: customerId, Loan_Date: dayjs().format('YYYY-MM-DD'),
    Loan_Amount: 30000, Interest_Rate_Pct: 2,
    items: [{ Item_Description: 'Gold Ring', Gross_Weight: 5, Net_Weight: 4.5 }],
  });
  if (loan.status !== 201) throw new Error('setup loan failed: ' + JSON.stringify(loan.body));

  const txn = await request(app).post(`/api/pawnbroking/loans/${loan.body.data.Loan_ID}/transactions`).set(auth()).send({
    Txn_Type: 'Interest Receipt', Total_Amount: 500, Interest_Collected: 500, Payment_Mode: 'Cash',
  });
  expect(txn.status).toBe(201);

  const journal = await latestJournal(txn.body.data.transaction.Receipt_Number);
  expect(journal).toBeDefined();
});

test('POST /api/repair posts its advance journal before the response returns', async () => {
  const res = await request(app).post('/api/repair').set(auth()).send({
    Customer_ID: customerId, Item_Description: 'QA Ring Resize', Advance_Paid: 1000, Payment_Mode: 'Cash',
  });
  expect(res.status).toBe(201);

  const journal = await latestJournal(res.body.data.Job_Card_Number);
  expect(journal).toBeDefined();
});

test('POST /api/karigar/settle posts its wage journal before the response returns', async () => {
  // /settle now only pays for a real, reconciled (Completed), unsettled
  // issue — not an arbitrary client-supplied amount — so this needs a
  // real issue+return first (see karigarWastageSettlement.test.js for
  // the full wastage-math/idempotency coverage of that route itself).
  const karigar = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA Journal Race Karigar', Vendor_Type: 'Karigar', Mobile_1: '9000000098',
  });
  const karigarId = karigar.body.data.Vendor_ID;
  const issue = await request(app).post('/api/karigar/issue').set(auth()).send({
    Karigar_ID: karigarId, Gold_Weight_Issued: 5, Gold_Rate_At_Issue: 6000, Karigar_Wages_Rate: 400, Issue_Date: '2026-08-24',
  });
  await request(app).post('/api/karigar/return').set(auth()).send({
    Issue_ID: issue.body.data.Issue_ID, Gross_Weight_Returned: 5, Net_Gold_Weight: 5, Wastage_Weight: 0, Return_Date: '2026-08-24',
  });

  const res = await request(app).post('/api/karigar/settle').set(auth()).send({
    karigarId, fromDate: '2026-08-24', toDate: '2026-08-24', paymentMode: 'Cash',
  });
  expect(res.status).toBe(200);

  const journals = await db('tbl_accounting_journal')
    .where({ Tenant_ID: tenant.tenantId })
    .where('Reference', 'like', `KARIGAR-SETTLE-${karigarId}-%`);
  expect(journals.length).toBe(1);
});

test('day close posts its cash-expense journal before the response returns', async () => {
  const today = dayjs().format('YYYY-MM-DD');
  const res = await request(app).post('/api/day-close/close').set(auth()).send({
    cash_in_hand: 5000, verified_cash: 5000, cash_expenses: 300,
  });
  expect(res.status).toBe(200);

  const journal = await latestJournal(`DAYCLOSE-${today}`);
  expect(journal).toBeDefined();
});
