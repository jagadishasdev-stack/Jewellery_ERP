/**
 * Branch-filtered Trial Balance/Cash Book only ever included sales and
 * day-close journals — purchase, karigar, HR payroll, and every manual
 * voucher (Receipt/Payment/Contra/Journal/Reverse) never passed branchId
 * to postJournal(), so their entries were invisible to a branch-scoped
 * report even though they happened at a real branch (found via audit).
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, branchA;
const authAs = (branchId) => ({ Authorization: `Bearer ${token}`, ...(branchId ? { 'X-Branch-ID': branchId } : {}) });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = login.body.data.token;

  branchA = `${tenant.tenantId}_BFJ`;
  await db('tbl_branch_master').insert({ Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Branch-Filtered Journal', Branch_Code: 'BFJ', Is_Active: true });
});

afterAll(async () => {
  await db('tbl_branch_master').where({ Branch_ID: branchA }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('a purchase made in a specific branch is stamped with that branch on its journal', async () => {
  const res = await request(app).post('/api/purchase/create').set(authAs(branchA)).send({
    Supplier_Name: 'QA Branch Journal Supplier', Purchase_Date: '2026-08-26', Total_Amount: 15000, Subtotal_Amount: 15000,
    items: [{ Metal_Type: 'Gold', Gross_Weight: 2, Purchase_Rate: 15000, Article_Number: 'QABFJ-PUR-1' }],
  });
  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: res.body.data.Purchase_Number, Source_Type: 'PURCHASE' }).first();
  expect(journal.Branch_ID).toBe(branchA);
});

test('a manual Journal voucher posted while a specific branch is active is stamped with that branch', async () => {
  const res = await request(app).post('/api/accounting/voucher/journal').set(authAs(branchA)).send({
    date: '2026-08-26', narration: 'QA branch voucher test',
    lines: [
      { account: 'Rent Account', type: 'Dr', amount: 2000 },
      { account: 'Cash Account', type: 'Cr', amount: 2000 },
    ],
  });
  expect(res.status).toBe(201);
  const journal = await db('tbl_accounting_journal').where({ Journal_ID: res.body.data.journalId }).first();
  expect(journal.Branch_ID).toBe(branchA);

  // And it now actually shows up in that branch's own Trial Balance.
  const tb = await request(app).get('/api/accounting/trial-balance').set(authAs(branchA));
  const rentRow = tb.body.data.rows.find((r) => r.Account_Name === 'Rent Account');
  expect(rentRow).toBeDefined();
  expect(parseFloat(rentRow.Dr_Balance)).toBeGreaterThanOrEqual(2000);
});

test('a karigar settlement while a specific branch is active is stamped with that branch', async () => {
  const vendor = await request(app).post('/api/karigar/vendor').set(authAs(branchA)).send({
    Vendor_Name: 'QA Branch Journal Karigar', Vendor_Type: 'Karigar', Mobile_1: '9990009991',
  });
  const issue = await request(app).post('/api/karigar/issue').set(authAs(branchA)).send({
    Karigar_ID: vendor.body.data.Vendor_ID, Gold_Weight_Issued: 5, Gold_Rate_At_Issue: 6000, Karigar_Wages_Rate: 300, Issue_Date: '2026-08-26',
  });
  await request(app).post('/api/karigar/return').set(authAs(branchA)).send({
    Issue_ID: issue.body.data.Issue_ID, Gross_Weight_Returned: 5, Net_Gold_Weight: 5, Wastage_Weight: 0, Return_Date: '2026-08-26',
  });
  const settle = await request(app).post('/api/karigar/settle').set(authAs(branchA)).send({
    karigarId: vendor.body.data.Vendor_ID, fromDate: '2026-08-26', toDate: '2026-08-26', paymentMode: 'Cash',
  });
  expect(settle.status).toBe(200);

  const journal = await db('tbl_accounting_journal').where('Reference', 'like', `KARIGAR-SETTLE-${vendor.body.data.Vendor_ID}-%`).first();
  expect(journal.Branch_ID).toBe(branchA);
});
