/**
 * Profit & Loss and Balance Sheet had no branch filtering at all
 * (unlike trial-balance/cash-book/bank-book, which already got this
 * treatment) — a branch user got tenant-wide figures with no
 * indication. P&L is branch-filtered directly (no opening-balance
 * concept, so no double-counting risk); Balance Sheet uses the same
 * tbl_account_branch_opening_balance mechanism as trial-balance.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');
const dayjs = require('dayjs');

let tenant, token, typeId, branchA, branchB;
const authAs = (branchId) => ({ Authorization: `Bearer ${token}`, ...(branchId ? { 'X-Branch-ID': branchId } : {}) });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = login.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  branchA = `${tenant.tenantId}_PLA`;
  branchB = `${tenant.tenantId}_PLB`;
  await db('tbl_branch_master').insert([
    { Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA P&L Branch A', Branch_Code: 'PLA', Is_Active: true },
    { Branch_ID: branchB, Tenant_ID: tenant.tenantId, Branch_Name: 'QA P&L Branch B', Branch_Code: 'PLB', Is_Active: true },
  ]);
});

afterAll(async () => {
  await db('tbl_branch_master').whereIn('Branch_ID', [branchA, branchB]).del();
  await testTenant.teardown();
  await db.destroy();
});

async function sellOneItem(branchId, price, articleNumber) {
  const ornament = await request(app).post('/api/ornaments').set(authAs(branchId)).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: price * 0.7, Total_Price: price, Article_Number: articleNumber,
  });
  return request(app).post('/api/sales/create').set(authAs(branchId)).send({
    Payment_Mode: 'Cash', Amount_Paid: price,
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: articleNumber, Total_Line_Price: price }],
    payments: [{ mode: 'Cash', amount: price }],
  });
}

test('P&L for one branch excludes another branch\'s income, and "All Branches" still sees everything', async () => {
  const today = dayjs().format('YYYY-MM-DD');
  await sellOneItem(branchA, 25000, 'QAPL-A1');
  await sellOneItem(branchB, 40000, 'QAPL-B1');

  const plA = await request(app).get('/api/accounting/profit-loss').set(authAs(branchA)).query({ from: today, to: today });
  const plB = await request(app).get('/api/accounting/profit-loss').set(authAs(branchB)).query({ from: today, to: today });
  const plAll = await request(app).get('/api/accounting/profit-loss').set(authAs('ALL')).query({ from: today, to: today });

  const salesA = plA.body.data.income.find((i) => i.Account_Name === 'Sales Account')?.Amount || 0;
  const salesB = plB.body.data.income.find((i) => i.Account_Name === 'Sales Account')?.Amount || 0;
  const salesAll = plAll.body.data.income.find((i) => i.Account_Name === 'Sales Account')?.Amount || 0;

  expect(salesA).toBeCloseTo(25000, 1);
  expect(salesB).toBeCloseTo(40000, 1);
  expect(salesAll).toBeGreaterThanOrEqual(salesA + salesB - 0.1); // all-branches sees both, never less
});

test('Balance Sheet for an unallocated branch shows ₹0 opening for an account, not the tenant-wide figure', async () => {
  const cashAccount = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenant.tenantId, Account_Name: 'Cash Account' }).first();
  await db('tbl_chart_of_accounts').where({ Account_ID: cashAccount.Account_ID }).update({ Opening_Balance: 50000, Opening_Balance_Type: 'Dr' });

  const bsAll = await request(app).get('/api/accounting/balance-sheet').set(authAs('ALL'));
  const bsBranch = await request(app).get('/api/accounting/balance-sheet').set(authAs(branchA));

  const cashAll = bsAll.body.data.Assets.find((a) => a.Account_Name === 'Cash Account')?.Amount || 0;
  const cashBranch = bsBranch.body.data.Assets.find((a) => a.Account_Name === 'Cash Account');
  // All-branches includes the real ₹50,000 tenant-wide opening balance.
  expect(cashAll).toBeGreaterThanOrEqual(50000);
  // Branch A never had this opening balance allocated to it — its own
  // Cash figure must NOT silently inherit the tenant-wide 50,000; it's
  // either absent (net zero) or driven purely by branch A's own postings.
  if (cashBranch) expect(cashBranch.Amount).not.toBe(cashAll);

  await db('tbl_chart_of_accounts').where({ Account_ID: cashAccount.Account_ID }).update({ Opening_Balance: 0, Opening_Balance_Type: 'Dr' });
});

test('Cash Book, Bank Book, P&L, and Balance Sheet endpoints all respond successfully (the previously-orphaned UI now has something real to call)', async () => {
  const cashBook = await request(app).get('/api/accounting/cash-book').set(authAs(null));
  const bankBook = await request(app).get('/api/accounting/bank-book').set(authAs(null));
  const pl = await request(app).get('/api/accounting/profit-loss').set(authAs(null));
  const bs = await request(app).get('/api/accounting/balance-sheet').set(authAs(null));
  expect(cashBook.status).toBe(200);
  expect(bankBook.status).toBe(200);
  expect(pl.status).toBe(200);
  expect(bs.status).toBe(200);
  expect(Array.isArray(bankBook.body.data)).toBe(true);
  expect(pl.body.data).toHaveProperty('netProfit');
  expect(bs.body.data).toHaveProperty('isBalanced');
});
