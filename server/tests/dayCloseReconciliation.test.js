/**
 * Day Close's expected cash used to be derived ONLY from cash sales — it
 * ignored every other cash-moving action (repair advances, karigar
 * settlements, purchase payments, ...), was frozen at whatever it was
 * when the page was first opened that day, and double-deducted cash
 * expenses from the shortage/excess calculation. All three meant a real
 * shop was guaranteed a bogus shortage/excess journal most days. Fixed
 * by computing expected cash directly from the Cash Account ledger.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');
const dayjs = require('dayjs');

let tenant, token, typeId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

test('expected cash includes non-sales cash movement (a repair advance), not just cash sales', async () => {
  const beforeToday = await request(app).get('/api/day-close/today').set(auth());
  const cashBefore = parseFloat(beforeToday.body.data.Cash_In_Hand);

  await request(app).post('/api/repair').set(auth()).send({
    Item_Description: 'QA Day Close repair test', Advance_Paid: 1500, Payment_Mode: 'Cash',
  });

  const afterToday = await request(app).get('/api/day-close/today').set(auth());
  const cashAfter = parseFloat(afterToday.body.data.Cash_In_Hand);
  // The old cash-sales-only calculation would show NO change at all here.
  expect(cashAfter).toBe(parseFloat((cashBefore + 1500).toFixed(2)));
});

test('cash expenses are not double-deducted: a verified count that exactly matches (cash in hand minus expenses) shows zero difference and posts only the expense journal', async () => {
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 8000, Total_Price: 20000, Article_Number: 'QADC-1',
  });
  await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash', Amount_Paid: 20000,
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: 'QADC-1', Total_Line_Price: 20000 }],
    payments: [{ mode: 'Cash', amount: 20000 }],
  });

  const today = await request(app).get('/api/day-close/today').set(auth());
  const cashInHand = parseFloat(today.body.data.Cash_In_Hand);
  const expenses = 1000;
  const expectedAfterExpenses = cashInHand - expenses;

  const close = await request(app).post('/api/day-close/close').set(auth()).send({
    verified_cash: expectedAfterExpenses, cash_expenses: expenses,
  });
  expect(close.status).toBe(200);
  expect(parseFloat(close.body.data.Difference)).toBe(0);

  // Only the expense journal posted (DAYCLOSE-<date>), no shortage/excess
  // journal (DAYCLOSE-<date>-DIFF) — the old double-deduction bug would
  // have shown a phantom ₹1000 shortage here even though the count was exact.
  const diffJournal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: `DAYCLOSE-${dayjs().format('YYYY-MM-DD')}-DIFF` }).first();
  expect(diffJournal).toBeUndefined();
});

test('a day already closed cannot be closed again', async () => {
  // Closed by the previous test in this file (same tenant, same date) —
  // used to be possible to re-close, double-restoring stock-adjacent
  // side effects and posting a second round of journals.
  const res = await request(app).post('/api/day-close/close').set(auth()).send({ verified_cash: 0, cash_expenses: 0 });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/already closed/);
});
