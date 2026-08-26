/**
 * purchase.js's accounting posting has fully supported Input CGST/SGST/
 * IGST since the COGS batch, but no client ever sent a GST_Amount — the
 * Purchase Hub and Purchase History create forms both hardcoded
 * Subtotal_Amount = Total_Amount (0 tax). This proves the whole chain
 * now that both forms send GST_Percentage → GST_Amount: the header's
 * CGST/SGST/IGST split, and the real Input-tax journal lines it posts.
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

test('an intrastate purchase (no supplier state, matches tenant) splits GST into CGST+SGST', async () => {
  const supplier = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA Intrastate Supplier', Vendor_Type: 'Supplier', Mobile_1: '9993330001',
  });
  const purchase = await request(app).post('/api/purchase/create').set(auth()).send({
    Supplier_ID: supplier.body.data.Vendor_ID, Purchase_Date: '2026-08-26', Purchase_Type: 'Gold',
    Subtotal_Amount: 100000, GST_Amount: 3000, Total_Amount: 103000,
    items: [{ Item_Description: 'Gold coins', Metal_Type: 'Gold', Gross_Weight: 16, Purity_Code: '916', Gold_Rate: 6250, Purchase_Rate: 100000 }],
  });
  expect(purchase.status).toBe(201);

  await new Promise((r) => setTimeout(r, 100)); // accounting post is awaited server-side, but give the test a beat before reading
  const header = await db('tbl_purchase_header').where({ Purchase_ID: purchase.body.data.Purchase_ID }).first();
  expect(parseFloat(header.CGST_Amount)).toBeCloseTo(1500, 2);
  expect(parseFloat(header.SGST_Amount)).toBeCloseTo(1500, 2);
  expect(parseFloat(header.IGST_Amount)).toBe(0);
  expect(header.Is_Interstate).toBe(false);

  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: purchase.body.data.Purchase_Number, Source_Type: 'PURCHASE' }).first();
  expect(journal).toBeDefined();
  const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID }).select('Ledger_Account', 'Entry_Type', 'Amount');
  const cgst = entries.find((e) => e.Ledger_Account === 'Input CGST Account');
  const sgst = entries.find((e) => e.Ledger_Account === 'Input SGST Account');
  expect(cgst.Entry_Type).toBe('Dr');
  expect(parseFloat(cgst.Amount)).toBeCloseTo(1500, 2);
  expect(sgst.Entry_Type).toBe('Dr');
  expect(parseFloat(sgst.Amount)).toBeCloseTo(1500, 2);
  const payable = entries.find((e) => e.Ledger_Account === 'Supplier Payable Account');
  expect(payable.Entry_Type).toBe('Cr');
  expect(parseFloat(payable.Amount)).toBeCloseTo(103000, 2);
});

test('an interstate purchase (supplier state differs from tenant state) books the full amount as IGST', async () => {
  const supplier = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA Interstate Supplier', Vendor_Type: 'Supplier', Mobile_1: '9993330002', State: 'Other State',
  });
  const purchase = await request(app).post('/api/purchase/create').set(auth()).send({
    Supplier_ID: supplier.body.data.Vendor_ID, Purchase_Date: '2026-08-26', Purchase_Type: 'Gold',
    Subtotal_Amount: 50000, GST_Amount: 1500, Total_Amount: 51500,
    items: [{ Item_Description: 'Gold chain', Metal_Type: 'Gold', Gross_Weight: 8, Purity_Code: '916', Gold_Rate: 6250, Purchase_Rate: 50000 }],
  });
  expect(purchase.status).toBe(201);

  const header = await db('tbl_purchase_header').where({ Purchase_ID: purchase.body.data.Purchase_ID }).first();
  expect(parseFloat(header.IGST_Amount)).toBeCloseTo(1500, 2);
  expect(parseFloat(header.CGST_Amount)).toBe(0);
  expect(parseFloat(header.SGST_Amount)).toBe(0);
  expect(header.Is_Interstate).toBe(true);

  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: purchase.body.data.Purchase_Number, Source_Type: 'PURCHASE' }).first();
  const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID }).select('Ledger_Account', 'Entry_Type', 'Amount');
  const igst = entries.find((e) => e.Ledger_Account === 'Input IGST Account');
  expect(igst.Entry_Type).toBe('Dr');
  expect(parseFloat(igst.Amount)).toBeCloseTo(1500, 2);
});
