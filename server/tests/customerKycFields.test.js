/**
 * tbl_customer_master already had GST_No/PAN_No columns the customer form
 * never exposed (dead columns, unreachable from the UI). This adds
 * Aadhar_Number/Customer_Category and confirms all four now round-trip
 * through POST/GET/PUT — no route changes were needed for these since
 * customers.js's POST/PUT already spread `req.body` directly, but that was
 * never actually exercised end-to-end for these specific fields before.
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
  await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

describe('Customer KYC / category fields', () => {
  let customerId;

  test('POST /api/customers persists GST_No/PAN_No/Aadhar_Number/Customer_Category', async () => {
    const res = await request(app).post('/api/customers').set(auth()).send({
      Customer_Name: 'QA KYC Customer',
      Mobile_1: '9822300001',
      GST_No: '29ABCDE1234F1Z5',
      PAN_No: 'ABCDE1234F',
      Aadhar_Number: '123456789012',
      Customer_Category: 'VIP',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.GST_No).toBe('29ABCDE1234F1Z5');
    expect(res.body.data.PAN_No).toBe('ABCDE1234F');
    expect(res.body.data.Aadhar_Number).toBe('123456789012');
    expect(res.body.data.Customer_Category).toBe('VIP');
    customerId = res.body.data.Customer_ID;
  });

  test('Customer_Category defaults to Regular when not provided', async () => {
    const res = await request(app).post('/api/customers').set(auth()).send({
      Customer_Name: 'QA Default Category Customer',
      Mobile_1: '9822300002',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.Customer_Category).toBe('Regular');
  });

  test('GET /api/customers/:id reflects the persisted KYC fields', async () => {
    const res = await request(app).get(`/api/customers/${customerId}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.Aadhar_Number).toBe('123456789012');
    expect(res.body.data.Customer_Category).toBe('VIP');
  });

  test('PUT /api/customers/:id updates Customer_Category', async () => {
    const res = await request(app).put(`/api/customers/${customerId}`).set(auth()).send({ Customer_Category: 'Platinum' });
    expect(res.status).toBe(200);
    expect(res.body.data.Customer_Category).toBe('Platinum');
  });
});
