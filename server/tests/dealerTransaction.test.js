/**
 * Dealer Transaction — dealer-to-dealer trades (issue/receipt/purchase/
 * sale) and settlement. Genuinely absent before (Missing Feature Report,
 * Transaction Menu spec) — only a cosmetic Customers->Dealers label swap
 * existed, no real dealer table, transaction, or settlement logic
 * anywhere.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, dealerId, supplierId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  const dealer = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA Test Dealer', Vendor_Type: 'Dealer', Mobile_1: '9900011111',
  });
  dealerId = dealer.body.data.Vendor_ID;

  const supplier = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA Non-Dealer Supplier', Vendor_Type: 'Supplier', Mobile_1: '9900011112',
  });
  supplierId = supplier.body.data.Vendor_ID;
});

afterAll(async () => {
  await db('tbl_dealer_transaction').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('creates a Purchase transaction against a real Dealer, defaulting to Pending settlement', async () => {
  const res = await request(app).post('/api/dealer-transaction').set(auth()).send({
    Dealer_ID: dealerId, Transaction_Type: 'Purchase', Metal_Type: 'Gold', Weight: 50, Rate_Per_Gram: 6000, Amount: 300000,
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Voucher_Number).toMatch(/DLR/);
  expect(res.body.data.Settlement_Status).toBe('Pending');
});

test('rejects a transaction against a vendor that is not set up as a Dealer', async () => {
  const res = await request(app).post('/api/dealer-transaction').set(auth()).send({
    Dealer_ID: supplierId, Transaction_Type: 'Purchase', Metal_Type: 'Gold', Amount: 10000,
  });
  expect(res.status).toBe(400);
});

test('an Issue transaction is auto-Settled — consignment movements never owe money', async () => {
  const res = await request(app).post('/api/dealer-transaction').set(auth()).send({
    Dealer_ID: dealerId, Transaction_Type: 'Issue', Metal_Type: 'Gold', Weight: 10, Amount: 60000,
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Settlement_Status).toBe('Settled');
});

test('settling a Purchase updates its status, and settling twice is rejected', async () => {
  const create = await request(app).post('/api/dealer-transaction').set(auth()).send({
    Dealer_ID: dealerId, Transaction_Type: 'Sale', Metal_Type: 'Silver', Weight: 200, Amount: 15000,
  });
  const settle = await request(app).post(`/api/dealer-transaction/${create.body.data.Transaction_ID}/settle`).set(auth());
  expect(settle.status).toBe(200);
  expect(settle.body.data.Settlement_Status).toBe('Settled');

  const doubleSettle = await request(app).post(`/api/dealer-transaction/${create.body.data.Transaction_ID}/settle`).set(auth());
  expect(doubleSettle.status).toBe(400);
});

test('GET /outstanding sums pending Purchase (payable) and Sale (receivable) per dealer', async () => {
  const res = await request(app).get('/api/dealer-transaction/outstanding').set(auth());
  expect(res.status).toBe(200);
  const row = res.body.data.find((r) => r.Dealer_ID === dealerId);
  expect(row).toBeDefined();
  expect(parseFloat(row.payable)).toBeGreaterThan(0); // the still-Pending Purchase from the first test
});
