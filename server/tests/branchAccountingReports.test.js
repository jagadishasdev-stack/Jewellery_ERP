/**
 * Multi-Branch Management — the accounting journal core and the reports
 * built on it. tbl_accounting_journal never had Branch_ID at all; now a
 * sale's own journal entry carries it, GET /api/accounting/day-book (a
 * pure date-scoped voucher listing, safe to filter) is branch-aware, and
 * GST summary / customer outstanding (sales-based, no opening-balance
 * math) are too. Trial Balance/Cash Book/Bank Book are ALSO branch-aware
 * now, but via a separate mechanism (tbl_account_branch_opening_balance)
 * since their per-account Opening_Balance is tenant-wide only — see
 * branchOpeningBalances.test.js, which covers those three specifically.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, branchA, branchB;
const authAs = (branchId) => ({ Authorization: `Bearer ${token}`, ...(branchId ? { 'X-Branch-ID': branchId } : {}) });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = login.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  branchA = `${tenant.tenantId}_ACA`;
  branchB = `${tenant.tenantId}_ACB`;
  await db('tbl_branch_master').insert([
    { Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Accounting Branch A', Branch_Code: 'ACA', Is_Active: true },
    { Branch_ID: branchB, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Accounting Branch B', Branch_Code: 'ACB', Is_Active: true },
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
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: price, Total_Price: price, Article_Number: articleNumber,
  });
  const sale = await request(app).post('/api/sales/create').set(authAs(branchId)).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: articleNumber, Total_Line_Price: price }],
  });
  return sale.body.data.sale;
}

test('a sale\'s accounting journal is stamped with the branch it was made in', async () => {
  const sale = await sellOneItem(branchA, 15000, 'QAACC-A1');
  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: sale.Invoice_Number }).first();
  expect(journal).toBeDefined();
  expect(journal.Branch_ID).toBe(branchA);
});

test('GET /api/accounting/day-book filters vouchers by branch', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const saleA = await sellOneItem(branchA, 8000, 'QAACC-DB-A1');
  const saleB = await sellOneItem(branchB, 6000, 'QAACC-DB-B1');

  const dayBookA = await request(app).get('/api/accounting/day-book').set(authAs(branchA)).query({ date: today });
  const vouchersA = dayBookA.body.data.vouchers.map(v => v.Reference);
  expect(vouchersA).toContain(saleA.Invoice_Number);
  expect(vouchersA).not.toContain(saleB.Invoice_Number);
});

test('GET /api/reports/gst-summary filters by branch without excluding anything from the total (All Branches still shows everything)', async () => {
  const today = new Date().toISOString().slice(0, 10);
  await sellOneItem(branchA, 20000, 'QAACC-GST-A1');
  await sellOneItem(branchB, 30000, 'QAACC-GST-B1');

  const gstA = await request(app).get('/api/reports/gst-summary').set(authAs(branchA)).query({ fromDate: today, toDate: today });
  const gstAll = await request(app).get('/api/reports/gst-summary').set(authAs('ALL')).query({ fromDate: today, toDate: today });

  expect(parseFloat(gstAll.body.data.total_invoice_value)).toBeGreaterThanOrEqual(
    parseFloat(gstA.body.data.total_invoice_value)
  );
  // Branch A's own total must be strictly less than the all-branches total
  // once Branch B has sales too — proves the filter actually narrows,
  // not just accepts and ignores the header.
  expect(parseFloat(gstA.body.data.total_invoice_value)).toBeLessThan(parseFloat(gstAll.body.data.total_invoice_value));
});
