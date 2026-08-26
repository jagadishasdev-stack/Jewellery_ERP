/**
 * Multi-Branch Management — branch-specific opening balances
 * (tbl_account_branch_opening_balance) and the three reports that depend
 * on them being real: Trial Balance, Cash Book, Bank Book. See that
 * table's own migration comment and accounting.js's comments above
 * trial-balance/bookFor for the full reasoning this proves out:
 *   - "All Branches" / no branch context must be byte-for-byte unaffected
 *     by anything allocated here — it always reads the account's own
 *     tenant-wide Opening_Balance directly.
 *   - A branch with nothing allocated reads ₹0, never the tenant-wide
 *     figure (that would double-count once per branch).
 *   - Allocating a branch's opening balance changes ONLY that branch's
 *     reports, not another branch's, not "All Branches".
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, branchA, branchB, cashAccount;
const authAs = (branchId) => ({ Authorization: `Bearer ${token}`, ...(branchId ? { 'X-Branch-ID': branchId } : {}) });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = login.body.data.token;

  branchA = `${tenant.tenantId}_OBA`;
  branchB = `${tenant.tenantId}_OBB`;
  await db('tbl_branch_master').insert([
    { Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Opening Bal Branch A', Branch_Code: 'OBA', Is_Active: true },
    { Branch_ID: branchB, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Opening Bal Branch B', Branch_Code: 'OBB', Is_Active: true },
  ]);

  cashAccount = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenant.tenantId, Account_Name: 'Cash Account' }).first();
});

afterAll(async () => {
  await db('tbl_branch_master').whereIn('Branch_ID', [branchA, branchB]).del();
  await testTenant.teardown();
  await db.destroy();
});

test('GET /branch-opening-balances requires a branchId', async () => {
  const res = await request(app).get('/api/accounting/branch-opening-balances').set(authAs(null));
  expect(res.status).toBe(400);
});

test('a fresh branch shows every account at ₹0, unallocated — never the tenant-wide figure', async () => {
  const res = await request(app).get('/api/accounting/branch-opening-balances').set(authAs(null)).query({ branchId: branchA });
  expect(res.status).toBe(200);
  const row = res.body.data.find((r) => r.Account_ID === cashAccount.Account_ID);
  expect(row.Has_Branch_Balance).toBe(false);
  expect(row.Branch_Opening_Balance).toBe(0);
});

test('PUT allocates a branch-specific opening balance, upserting on a second call rather than duplicating', async () => {
  const put1 = await request(app).put('/api/accounting/branch-opening-balances').set(authAs(null))
    .send({ Account_ID: cashAccount.Account_ID, Branch_ID: branchA, Opening_Balance: 50000, Opening_Balance_Type: 'Dr' });
  expect(put1.status).toBe(200);

  const put2 = await request(app).put('/api/accounting/branch-opening-balances').set(authAs(null))
    .send({ Account_ID: cashAccount.Account_ID, Branch_ID: branchA, Opening_Balance: 75000, Opening_Balance_Type: 'Dr' });
  expect(put2.status).toBe(200);

  const rows = await db('tbl_account_branch_opening_balance').where({ Account_ID: cashAccount.Account_ID, Branch_ID: branchA });
  expect(rows.length).toBe(1); // upsert, not a duplicate row
  expect(parseFloat(rows[0].Opening_Balance)).toBe(75000);

  const get = await request(app).get('/api/accounting/branch-opening-balances').set(authAs(null)).query({ branchId: branchA });
  const row = get.body.data.find((r) => r.Account_ID === cashAccount.Account_ID);
  expect(row.Has_Branch_Balance).toBe(true);
  expect(row.Branch_Opening_Balance).toBe(75000);
});

test('Trial Balance for the allocated branch includes its own opening balance even with zero journal entries there', async () => {
  const res = await request(app).get('/api/accounting/trial-balance').set(authAs(branchA));
  expect(res.status).toBe(200);
  const row = res.body.data.rows.find((r) => r.Account_ID === cashAccount.Account_ID);
  expect(row).toBeDefined();
  expect(row.Dr_Balance).toBe(75000);
});

test('Trial Balance for a DIFFERENT (unallocated) branch shows ₹0 for that same account, not the tenant-wide figure and not Branch A\'s figure', async () => {
  const res = await request(app).get('/api/accounting/trial-balance').set(authAs(branchB));
  expect(res.status).toBe(200);
  const row = res.body.data.rows.find((r) => r.Account_ID === cashAccount.Account_ID);
  expect(row).toBeUndefined(); // zero balance rows are filtered out entirely, same as the pre-existing All-Branches behavior
});

test('Trial Balance in "All Branches" mode is completely unaffected — still reads the tenant-wide Opening_Balance directly', async () => {
  // Give the account a real tenant-wide opening balance directly (bypassing
  // the branch table entirely) to prove All-Branches never looks at
  // tbl_account_branch_opening_balance at all.
  await db('tbl_chart_of_accounts').where({ Account_ID: cashAccount.Account_ID }).update({ Opening_Balance: 10000, Opening_Balance_Type: 'Dr' });

  const allBranches = await request(app).get('/api/accounting/trial-balance').set(authAs('ALL'));
  const noBranchContext = await request(app).get('/api/accounting/trial-balance').set(authAs(null));

  const rowAll = allBranches.body.data.rows.find((r) => r.Account_ID === cashAccount.Account_ID);
  const rowNone = noBranchContext.body.data.rows.find((r) => r.Account_ID === cashAccount.Account_ID);
  // 10000 (tenant-wide), NOT 75000 (Branch A's allocation) — proves the two
  // figures are genuinely independent, not one falling back to the other.
  expect(rowAll.Dr_Balance).toBe(10000);
  expect(rowNone.Dr_Balance).toBe(10000);

  await db('tbl_chart_of_accounts').where({ Account_ID: cashAccount.Account_ID }).update({ Opening_Balance: 0, Opening_Balance_Type: 'Dr' });
});

test('Cash Book\'s closing balance for the allocated branch reflects its own opening balance', async () => {
  const res = await request(app).get('/api/accounting/cash-book').set(authAs(branchA));
  expect(res.status).toBe(200);
  expect(res.body.data.closingBalance).toBe(75000);
});

test('Cash Book for an unallocated branch closes at ₹0, not the tenant-wide figure', async () => {
  const res = await request(app).get('/api/accounting/cash-book').set(authAs(branchB));
  expect(res.status).toBe(200);
  expect(res.body.data.closingBalance).toBe(0);
});

test('reconcile endpoint reports what has and hasn\'t been allocated across branches for one account', async () => {
  const res = await request(app).get('/api/accounting/branch-opening-balances/reconcile').set(authAs(null)).query({ accountId: cashAccount.Account_ID });
  expect(res.status).toBe(200);
  expect(res.body.data.allocatedNet).toBe(75000); // Branch A only, Branch B never allocated
  expect(res.body.data.branchesAllocated).toBe(1);
});
