/**
 * Financial-year-end close — flagged directly in accounting.js's own
 * balance-sheet comment ("real retained-earnings closing only happens
 * at financial-year-end (not built yet)"). Proves the real closing-entry
 * mechanics: Income/Expense accounts zeroed via a balanced journal, net
 * profit/loss permanently rolled into Retained Earnings Account, and
 * that a SUBSEQUENT since-inception report (Trial Balance) no longer
 * carries the closed year's revenue/expense forward indefinitely.
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

async function trialBalanceOf(accountName) {
  const tb = await request(app).get('/api/accounting/trial-balance').set(auth());
  return tb.body.data.rows.find((r) => r.Account_Name === accountName);
}

test('closing a profitable prior year zeroes Income/Expense and rolls net profit into Retained Earnings', async () => {
  // Backdated into FY 2025-04-01..2026-03-31 (prior to the test env's "today", 2026-08-26).
  await request(app).post('/api/accounting/voucher/journal').set(auth()).send({
    date: '2025-06-15', narration: 'QA FY Close Income',
    lines: [{ account: 'Cash Account', type: 'Dr', amount: 100000 }, { account: 'Sales Account', type: 'Cr', amount: 100000 }],
  });
  await request(app).post('/api/accounting/voucher/journal').set(auth()).send({
    date: '2025-07-10', narration: 'QA FY Close Expense',
    lines: [{ account: 'Rent Expense Account', type: 'Dr', amount: 30000 }, { account: 'Cash Account', type: 'Cr', amount: 30000 }],
  });

  const beforeSales = await trialBalanceOf('Sales Account');
  expect(parseFloat(beforeSales.Cr_Balance)).toBeGreaterThanOrEqual(100000);

  const close = await request(app).post('/api/accounting/close-financial-year').set(auth()).send({
    FY_Start: '2025-04-01', FY_End: '2026-03-31',
  });
  expect(close.status).toBe(201);
  expect(parseFloat(close.body.data.Net_Profit)).toBe(70000);

  const afterSales = await trialBalanceOf('Sales Account');
  const afterRent = await trialBalanceOf('Rent Expense Account');
  expect(afterSales).toBeUndefined(); // fully zeroed -> trial balance drops it (Dr_Balance/Cr_Balance both 0)
  expect(afterRent).toBeUndefined();

  const retainedEarnings = await trialBalanceOf('Retained Earnings Account');
  expect(retainedEarnings).toBeDefined();
  expect(parseFloat(retainedEarnings.Cr_Balance)).toBe(70000);

  const closesList = await request(app).get('/api/accounting/financial-year-closes').set(auth());
  expect(closesList.body.data.some((c) => c.Journal_Reference === close.body.data.Journal_Reference)).toBe(true);
});

test('rejects closing the exact same period again (correctly reported as an overlap with the prior close)', async () => {
  const res = await request(app).post('/api/accounting/close-financial-year').set(auth()).send({
    FY_Start: '2025-04-01', FY_End: '2026-03-31',
  });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/overlaps/);
});

test('rejects a new close whose FY_Start overlaps the already-closed period', async () => {
  const res = await request(app).post('/api/accounting/close-financial-year').set(auth()).send({
    FY_Start: '2026-01-01', FY_End: '2026-06-30',
  });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/overlaps/);
});

test('rejects closing a financial year that has not ended yet', async () => {
  const res = await request(app).post('/api/accounting/close-financial-year').set(auth()).send({
    FY_Start: '2026-04-01', FY_End: '2099-03-31',
  });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/not ended yet/);
});

test('a loss-making period debits Retained Earnings instead of crediting it', async () => {
  const cust = await request(app).post('/api/customers').set(auth()).send({ Customer_Name: 'QA FY Loss', Mobile_1: '9440010001' });
  await request(app).post('/api/accounting/voucher/journal').set(auth()).send({
    date: '2026-04-15', narration: 'QA FY Loss Income',
    lines: [{ account: 'Cash Account', type: 'Dr', amount: 10000 }, { account: 'Sales Account', type: 'Cr', amount: 10000 }],
  });
  await request(app).post('/api/accounting/voucher/journal').set(auth()).send({
    date: '2026-05-01', narration: 'QA FY Loss Expense',
    lines: [{ account: 'Rent Expense Account', type: 'Dr', amount: 50000 }, { account: 'Cash Account', type: 'Cr', amount: 50000 }],
  });

  const close = await request(app).post('/api/accounting/close-financial-year').set(auth()).send({
    FY_Start: '2026-04-01', FY_End: '2026-07-31', // still in the past relative to "today" 2026-08-26
  });
  expect(close.status).toBe(201);
  expect(parseFloat(close.body.data.Net_Profit)).toBe(-40000);

  const retainedEarnings = await trialBalanceOf('Retained Earnings Account');
  // Previous close credited 70000; this loss debits 40000 -> net Cr 30000.
  expect(parseFloat(retainedEarnings.Cr_Balance)).toBe(30000);
});
