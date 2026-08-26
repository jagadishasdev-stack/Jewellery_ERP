/**
 * pawnbroking.js and savingsScheme.js were the last two real-money
 * modules whose journals never carried Branch_ID (bankCheque.js also
 * had none at all — fixed alongside these). Confirms both now stamp it.
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

  branchA = `${tenant.tenantId}_PSB`;
  await db('tbl_branch_master').insert({ Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Pawn/Savings Branch Stamp', Branch_Code: 'PSB', Is_Active: true });
});

afterAll(async () => {
  await db('tbl_branch_master').where({ Branch_ID: branchA }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('a pawn loan disbursed in a specific branch stamps that branch on its journal', async () => {
  const cust = await request(app).post('/api/customers').set(authAs(branchA)).send({ Customer_Name: 'QA Pawn Branch Customer', Mobile_1: '9992223401' });
  const loan = await request(app).post('/api/pawnbroking/loans').set(authAs(branchA)).send({
    Customer_ID: cust.body.data.Customer_ID, Loan_Date: '2026-08-27', Loan_Amount: 20000, Interest_Rate_Pct: 2,
    items: [{ Item_Description: 'Gold chain', Gross_Weight: 10, Net_Weight: 9.5, Estimated_Value: 22000 }],
  });
  expect(loan.status).toBe(201);
  expect(loan.body.data.Branch_ID).toBe(branchA);

  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: loan.body.data.Loan_Number }).first();
  expect(journal.Branch_ID).toBe(branchA);
});

test('a savings scheme collection in a specific branch stamps that branch on its journal', async () => {
  const scheme = await request(app).post('/api/savings/schemes').set(authAs(branchA)).send({
    Scheme_Code: 'QAPSB', Scheme_Name: 'QA PSB Scheme', Duration_Months: 11, Default_Monthly_Amount: 1000,
  });
  const group = await request(app).post('/api/savings/groups').set(authAs(branchA)).send({
    Scheme_ID: scheme.body.data.Scheme_ID, Group_Code: 'QAPSBG', Group_Name: 'QA PSB Group',
    Start_Date: '2026-08-01', Monthly_Amount: 1000, Total_Installments: 11,
  });
  const member = await request(app).post('/api/savings/members').set(authAs(branchA)).send({
    Member_Name: 'QA PSB Member', Mobile: '9992223402', Scheme_ID: scheme.body.data.Scheme_ID,
    Group_ID: group.body.data.Group_ID, Joining_Date: '2026-08-01', Installment_Amount: 1000,
  });
  const collect = await request(app).post('/api/savings/collect').set(authAs(branchA)).send({
    Member_ID: member.body.data.Member_ID, Amount: 1000, Payment_Mode: 'Cash',
  });
  expect(collect.status).toBe(201);

  const txn = await db('tbl_scheme_transactions').where({ Tenant_ID: tenant.tenantId, Receipt_Number: collect.body.data.receipt_number }).first();
  expect(txn.Branch_ID).toBe(branchA);
  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: collect.body.data.receipt_number }).first();
  expect(journal.Branch_ID).toBe(branchA);
});
