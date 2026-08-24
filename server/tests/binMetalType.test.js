/**
 * tbl_bin_purchase / tbl_bin_sales_return / tbl_bin_orders / tbl_bin_pure_gold
 * only ever had a free-text Purity field — Metal_Type was guessed from it
 * only at move-to-stock time (inferMetalTypeFromPurityText). Now the bin
 * entry itself captures Metal_Type at creation, and move-to-stock prefers
 * that real value over re-guessing from Purity text.
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

test('POST /bin/purchase stores an explicit Metal_Type, and rejects an invalid one', async () => {
  const ok = await request(app).post('/api/bin/purchase').set(auth()).send({
    Supplier_Name: 'QA Silver Supplier', Purchase_Date: '2026-08-19',
    Gross_Weight: 50, Purchase_Amount: 40000, Metal_Type: 'Silver', Purity: '925',
  });
  expect(ok.status).toBe(201);
  expect(ok.body.data.Metal_Type).toBe('Silver');

  const bad = await request(app).post('/api/bin/purchase').set(auth()).send({
    Supplier_Name: 'QA Supplier', Purchase_Date: '2026-08-19',
    Gross_Weight: 10, Purchase_Amount: 10000, Metal_Type: 'Bronze',
  });
  expect(bad.status).toBe(422);
});

test('POST /bin/purchase infers Metal_Type from Purity text when not given explicitly', async () => {
  const res = await request(app).post('/api/bin/purchase').set(auth()).send({
    Supplier_Name: 'QA Platinum Supplier', Purchase_Date: '2026-08-19',
    Gross_Weight: 20, Purchase_Amount: 90000, Purity: 'PLAT-950',
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Metal_Type).toBe('Platinum');
});

test('move-to-stock carries the bin entry\'s own Metal_Type onto the new ornament', async () => {
  const bin = await request(app).post('/api/bin/purchase').set(auth()).send({
    Supplier_Name: 'QA Silver Supplier 2', Purchase_Date: '2026-08-19',
    Gross_Weight: 30, Purchase_Amount: 25000, Metal_Type: 'Silver', Purity: '925',
  });
  expect(bin.status).toBe(201);

  const moved = await request(app).post(`/api/bin/purchase/${bin.body.data.Bin_ID}/move-to-stock`).set(auth()).send({
    Gold_Rate: 90,
  });
  expect(moved.status).toBe(200);
  expect(moved.body.data.ornament.Metal_Type).toBe('Silver');
});

test('POST /bin/sales-return and /bin/orders also capture Metal_Type', async () => {
  const ret = await request(app).post('/api/bin/sales-return').set(auth()).send({
    Customer_Name: 'QA Return Customer', Return_Date: '2026-08-19',
    Gross_Weight: 5, Metal_Type: 'Platinum',
  });
  expect(ret.status).toBe(201);
  expect(ret.body.data.Metal_Type).toBe('Platinum');

  const order = await request(app).post('/api/bin/orders').set(auth()).send({
    Party_Name: 'QA Order Party', Order_Date: '2026-08-19', Order_Type: 'Customer', Metal_Type: 'Diamond',
  });
  expect(order.status).toBe(201);
  expect(order.body.data.Metal_Type).toBe('Diamond');
});

test('POST /bin/pure-gold defaults Metal_Type to Gold when not specified', async () => {
  const res = await request(app).post('/api/bin/pure-gold').set(auth()).send({
    Supplier_Name: 'QA Bullion Supplier', Purchase_Date: '2026-08-19',
    Gross_Weight: 100, Net_Weight: 100, Purchase_Amount: 600000,
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Metal_Type).toBe('Gold');
});
