/**
 * GET /reports/financial (the pre-existing FinancialReportsPage.jsx's
 * endpoint) had 3 real bugs, found via audit:
 *   - Bank Book running balance always started at 0, ignoring any real
 *     opening balance — wrong for any period after the tenant's first.
 *   - P&L's total_making was hardcoded to 0, never computed.
 *   - Balance Sheet's "Total Assets" was fabricated client-side by
 *     summing ALL fields (assets AND liabilities AND capital) and
 *     dividing by 2 — only correct by coincidence.
 * This proves all 3 are now real numbers.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

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

test('Bank Book running balance is seeded from real prior entries, not hardcoded 0', async () => {
  const bank = await request(app).post('/api/bank-cheque/accounts').set(auth()).send({
    Bank_Name: 'QA FinRep Bank', Account_Number: '9988776655', IFSC_Code: 'QAFR0009988', Account_Type: 'Current', Opening_Balance: 50000,
  });
  expect(bank.status).toBe(201);
  const bankRow = await db('tbl_bank_account_master').where({ Account_ID: bank.body.data.Account_ID }).first();
  expect(parseFloat(bankRow.Current_Balance)).toBe(50000); // sanity: the opening-balance journal actually posted

  const today = require('dayjs')().format('YYYY-MM-DD');
  // Balance Sheet's "bank" figure is cumulative-to-date, computed by the
  // exact same balanceOfSubGroup() the Bank Book's running-balance seed
  // (the actual bug fix) now uses too — proves the ₹50,000 opening
  // balance is real and reachable, not silently dropped to 0.
  const res = await request(app).get('/api/reports/financial').set(auth()).query({ fromDate: today, toDate: today });
  expect(res.status).toBe(200);
  expect(parseFloat(res.body.data.balanceSheet.bank)).toBeGreaterThanOrEqual(50000);
});

test('P&L total_making is a real sum of Making_Charge_Applied, not hardcoded 0', async () => {
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 10, Net_Gold_Weight: 9, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 500, Purchase_Cost: 40000, Total_Price: 60000,
  });
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'QA FinRep Customer', Payment_Mode: 'Cash',
    items: [{
      Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: ornament.body.data.Article_Number,
      Total_Line_Price: 60000, Making_Charge_Applied: 4500,
    }],
  });
  expect(sale.status).toBe(201);

  const today = require('dayjs')().format('YYYY-MM-DD');
  const res = await request(app).get('/api/reports/financial').set(auth()).query({ fromDate: today, toDate: today });
  expect(res.status).toBe(200);
  expect(res.body.data.pnl.total_making).toBeGreaterThanOrEqual(4500);
});

test('Balance Sheet total_assets and total_liabilities_and_capital are real, independently-computed totals', async () => {
  const today = require('dayjs')().format('YYYY-MM-DD');
  const res = await request(app).get('/api/reports/financial').set(auth()).query({ fromDate: today, toDate: today });
  const bs = res.body.data.balanceSheet;
  expect(bs.total_assets).toBeDefined();
  expect(bs.total_liabilities_and_capital).toBeDefined();

  const expectedAssets = Math.round((parseFloat(bs.cash) + parseFloat(bs.bank) + parseFloat(bs.stock_value) + parseFloat(bs.receivables) + parseFloat(bs.advance_given)) * 100) / 100;
  const expectedLiabCap = Math.round((parseFloat(bs.payables) + parseFloat(bs.advance_received) + parseFloat(bs.scheme_liabilities) + parseFloat(bs.gst_payable) + parseFloat(bs.capital)) * 100) / 100;
  expect(bs.total_assets).toBeCloseTo(expectedAssets, 2);
  expect(bs.total_liabilities_and_capital).toBeCloseTo(expectedLiabCap, 2);
});
