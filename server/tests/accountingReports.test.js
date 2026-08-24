/**
 * The accounting reports (server/src/routes/accounting.js) — real sales
 * and a real purchase go through the live routes, then the reports are
 * checked against what actually got posted. The property that matters
 * most here: Trial Balance and Balance Sheet must always balance, since
 * postJournal() now enforces Dr=Cr on every single post — if a report
 * query has a bug that double-counts or drops a line, this is what would
 * catch it.
 */
const request = require('supertest');
const dayjs = require('dayjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, ornamentId;

// Sales/Purchase post their accounting journal asynchronously and
// non-blocking (`.catch(...)`, never awaited by the response) — a
// deliberate, pre-existing design choice so a bookkeeping failure never
// takes down a real sale. That means the HTTP response can return before
// the journal actually exists; poll for it instead of assuming it's
// already there the instant the create-request resolves.
async function waitForJournalCount(tenantId, expectedCount, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const [{ count }] = await db('tbl_accounting_journal').where({ Tenant_ID: tenantId }).count('Journal_ID as count');
    if (parseInt(count) >= expectedCount) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for ${expectedCount} journal(s) for ${tenantId}.`);
}

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  const [ornament] = await db('tbl_ornament_master').insert({
    Tenant_ID: tenant.tenantId, Article_Number: 'QATEST-ACCT-001', Gross_Weight: 10, Net_Gold_Weight: 9.5,
    Current_Gold_Rate: 6000, Base_Making_Charge_Per_Gram: 500, Purchase_Cost: 50000, Stock_Quantity: 1,
    Is_Sold: false, Is_Active: true, Total_Price: 61750,
  }).returning('Ornament_ID');
  ornamentId = ornament.Ornament_ID;
});

afterAll(async () => {
  await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('a real sale posts a balanced journal reflected correctly in Trial Balance', async () => {
  const sale = await request(app).post('/api/sales/create').set('Authorization', `Bearer ${token}`).send({
    items: [{ Ornament_ID: ornamentId, Total_Line_Price: 61750, Gross_Weight: 10, Net_Gold_Weight: 9.5 }],
    Payment_Mode: 'Cash', Amount_Paid: 61750, Customer_Name: 'Report Test Customer',
    payments: [{ mode: 'Cash', amount: 61750 }],
  });
  expect(sale.status).toBe(201);
  await waitForJournalCount(tenant.tenantId, 1);

  const tb = await request(app).get('/api/accounting/trial-balance').set('Authorization', `Bearer ${token}`);
  expect(tb.status).toBe(200);
  expect(tb.body.data.isBalanced).toBe(true);
  const cashRow = tb.body.data.rows.find((r) => r.Account_Name === 'Cash Account');
  expect(cashRow.Dr_Balance).toBe(61750);
});

test('the same sale is reflected in the Balance Sheet, which still balances', async () => {
  const bs = await request(app).get('/api/accounting/balance-sheet').set('Authorization', `Bearer ${token}`);
  expect(bs.status).toBe(200);
  expect(bs.body.data.isBalanced).toBe(true);
  expect(bs.body.data.Assets.find((a) => a.Account_Name === 'Cash Account').Amount).toBe(61750);
});

test('the accounting dashboard reflects today\'s real sale', async () => {
  const dash = await request(app).get('/api/accounting/dashboard').set('Authorization', `Bearer ${token}`);
  expect(dash.status).toBe(200);
  expect(dash.body.data.todaySales).toBe(61750);
  expect(dash.body.data.cashBalance).toBe(61750);
});

test('a real purchase posts an accrual journal that still balances', async () => {
  const purchase = await request(app).post('/api/purchase/create').set('Authorization', `Bearer ${token}`).send({
    items: [{ Gross_Weight: 50, Purchase_Rate: 250000, Create_Inventory: false }],
    Total_Amount: 250000, Subtotal_Amount: 250000, Payment_Mode: 'Cash',
  });
  expect(purchase.status).toBe(201);
  await waitForJournalCount(tenant.tenantId, 2); // sale's journal + this purchase's accrual journal

  const tb = await request(app).get('/api/accounting/trial-balance').set('Authorization', `Bearer ${token}`);
  expect(tb.body.data.isBalanced).toBe(true);
  const payableRow = tb.body.data.rows.find((r) => r.Account_Name === 'Supplier Payable Account');
  expect(payableRow.Cr_Balance).toBe(250000); // no Amount_Paid sent — full accrual, nothing paid yet
});

test('GET /api/reports/financial (the pre-existing frontend page\'s endpoint) returns real, internally-consistent numbers', async () => {
  const today = dayjs().format('YYYY-MM-DD'); // local (IST) day, matching the server's own today() now — not toISOString()'s UTC one
  const res = await request(app).get('/api/reports/financial').set('Authorization', `Bearer ${token}`).query({ fromDate: today, toDate: today });
  expect(res.status).toBe(200);
  expect(res.body.data.balanceSheet.cash).toBe(61750);
  expect(res.body.data.balanceSheet.payables).toBe(250000);
  expect(res.body.data.cashBook.length).toBeGreaterThan(0);
});
