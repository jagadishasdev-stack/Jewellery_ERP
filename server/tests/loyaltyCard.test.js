/**
 * Loyalty Card — Members + Day Sheet (Master/Reports/Utility audit gap).
 * A card number tied to the EXISTING points engine (tbl_loyalty_
 * transactions, Loyalty_Points), not a new tier/benefit system.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');
const dayjs = require('dayjs');

let tenant, token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  await db('tbl_loyalty_transactions').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

async function createCustomer(name, mobile) {
  const res = await request(app).post('/api/customers').set(auth()).send({ Customer_Name: name, Mobile_1: mobile });
  return res.body.data;
}

test('POST /compliance/loyalty-card/issue assigns a card number and stamps the issue date', async () => {
  const customer = await createCustomer('QA Loyalty Member 1', '9822400001');
  const res = await request(app).post('/api/compliance/loyalty-card/issue').set(auth()).send({ Customer_ID: customer.Customer_ID, Card_Number: 'LC-QA-0001' });
  expect(res.status).toBe(200);
  expect(res.body.data.Loyalty_Card_Number).toBe('LC-QA-0001');
  expect(res.body.data.Loyalty_Card_Issue_Date).not.toBeNull();
});

test('a duplicate card number within the same tenant is rejected with a friendly 409, not a raw 500', async () => {
  const c1 = await createCustomer('QA Loyalty Member 2', '9822400002');
  const c2 = await createCustomer('QA Loyalty Member 3', '9822400003');
  await request(app).post('/api/compliance/loyalty-card/issue').set(auth()).send({ Customer_ID: c1.Customer_ID, Card_Number: 'LC-QA-DUP' });
  const dup = await request(app).post('/api/compliance/loyalty-card/issue').set(auth()).send({ Customer_ID: c2.Customer_ID, Card_Number: 'LC-QA-DUP' });
  expect(dup.status).toBe(409);
  expect(dup.body.message).toMatch(/already assigned/);
});

test('GET /compliance/loyalty-card/members lists only customers with a card, not every customer', async () => {
  const withCard = await createCustomer('QA Loyalty Member 4', '9822400004');
  await createCustomer('QA No Card Customer', '9822400005'); // no card issued
  await request(app).post('/api/compliance/loyalty-card/issue').set(auth()).send({ Customer_ID: withCard.Customer_ID, Card_Number: 'LC-QA-0004' });

  const res = await request(app).get('/api/compliance/loyalty-card/members').set(auth());
  expect(res.status).toBe(200);
  expect(res.body.data.some((m) => m.Customer_Name === 'QA Loyalty Member 4')).toBe(true);
  expect(res.body.data.some((m) => m.Customer_Name === 'QA No Card Customer')).toBe(false);
});

test('GET /compliance/loyalty-card/day-sheet aggregates Earned/Redeemed across all customers for one date', async () => {
  const customer = await createCustomer('QA Day Sheet Customer', '9822400006');
  const today = dayjs().format('YYYY-MM-DD');
  await db('tbl_loyalty_transactions').insert([
    { Tenant_ID: tenant.tenantId, Customer_ID: customer.Customer_ID, Txn_Type: 'Earned', Points: 50, Running_Balance: 50, Description: 'QA test earn' },
    { Tenant_ID: tenant.tenantId, Customer_ID: customer.Customer_ID, Txn_Type: 'Redeemed', Points: 20, Running_Balance: 30, Description: 'QA test redeem' },
  ]);

  const res = await request(app).get('/api/compliance/loyalty-card/day-sheet').set(auth()).query({ date: today });
  expect(res.status).toBe(200);
  expect(res.body.data.totalEarned).toBeGreaterThanOrEqual(50);
  expect(res.body.data.totalRedeemed).toBeGreaterThanOrEqual(20);
  expect(res.body.data.transactions.some((t) => t.Description === 'QA test earn' && t.Customer_Name === 'QA Day Sheet Customer')).toBe(true);
});

test('GET /compliance/loyalty-card/day-sheet requires a date query param', async () => {
  const res = await request(app).get('/api/compliance/loyalty-card/day-sheet').set(auth());
  expect(res.status).toBe(400);
});
