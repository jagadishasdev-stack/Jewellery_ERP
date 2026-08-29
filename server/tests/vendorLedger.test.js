/**
 * GET /api/reports/supplier-ledger/:id — previously missing entirely
 * (Missing Feature Report items B10: Supplier/Karigar Ledger). Only a
 * pooled "Supplier Payable" Chart-of-Accounts account existed before —
 * this is the first per-vendor transaction list.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, vendorId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  const vendor = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA Ledger Supplier', Vendor_Type: 'Supplier', Mobile_1: '9812300001',
  });
  vendorId = vendor.body.data.Vendor_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

test('lists this vendor\'s purchases with running totals', async () => {
  await request(app).post('/api/purchase/create').set(auth()).send({
    Supplier_ID: vendorId, Supplier_Name: 'QA Ledger Supplier', Purchase_Date: '2026-08-25',
    Total_Amount: 40000, Subtotal_Amount: 40000,
    items: [{ Metal_Type: 'Gold', Gross_Weight: 5, Purchase_Rate: 40000, Article_Number: 'QAVENDLED-1' }],
  });
  await request(app).post('/api/purchase/create').set(auth()).send({
    Supplier_ID: vendorId, Supplier_Name: 'QA Ledger Supplier', Purchase_Date: '2026-08-26',
    Total_Amount: 15000, Subtotal_Amount: 15000,
    items: [{ Metal_Type: 'Gold', Gross_Weight: 2, Purchase_Rate: 15000, Article_Number: 'QAVENDLED-2' }],
  });

  const res = await request(app).get(`/api/reports/supplier-ledger/${vendorId}`).set(auth());
  expect(res.status).toBe(200);
  expect(res.body.data.supplier.Vendor_Name).toBe('QA Ledger Supplier');
  expect(res.body.data.purchases.length).toBe(2);
  expect(res.body.data.totals.total_purchases).toBe(2);
  expect(res.body.data.totals.total_value).toBe(55000);
  expect(res.body.data.totals.total_outstanding).toBe(55000); // nothing paid yet
});

test('a vendor with no purchases returns an empty ledger, not an error', async () => {
  const vendor = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA Ledger Supplier No Purchases', Vendor_Type: 'Karigar', Mobile_1: '9812300002',
  });
  const res = await request(app).get(`/api/reports/supplier-ledger/${vendor.body.data.Vendor_ID}`).set(auth());
  expect(res.status).toBe(200);
  expect(res.body.data.purchases).toEqual([]);
  expect(res.body.data.totals.total_purchases).toBe(0);
});
