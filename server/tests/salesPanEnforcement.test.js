/**
 * PAN enforcement (Income Tax Rule 114B — a PAN is required for retail
 * transactions of ₹2,00,000 or more) was client-only: POSPage.jsx blocks
 * checkout without a valid PAN above the threshold, but the API itself
 * accepted PAN_Number/PAN_Verified as whatever the caller claimed, with
 * zero validation — a direct API call bypassed the rule entirely, and
 * PAN_Verified could be set true for a garbage or missing PAN.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

async function makeOrnament(articleNumber, price) {
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 40, Net_Gold_Weight: 38, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 500, Purchase_Cost: 150000, Total_Price: price,
  });
  return ornament.body.data;
}

test('a sale >= ₹2,00,000 with no PAN is rejected', async () => {
  const ornament = await makeOrnament('QATEST-PAN-001', 250000);
  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'QA PAN Customer', Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 250000 }],
  });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/PAN/);
});

test('a sale >= ₹2,00,000 with a garbage PAN string is rejected, even if the client claims PAN_Verified: true', async () => {
  const ornament = await makeOrnament('QATEST-PAN-002', 250000);
  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'QA PAN Customer', Payment_Mode: 'Cash',
    PAN_Number: 'NOT-A-REAL-PAN', PAN_Verified: true, // client claims verified — must not be trusted
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 250000 }],
  });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/PAN/);
});

test('a sale >= ₹2,00,000 with a real-format PAN succeeds and PAN_Verified is computed server-side', async () => {
  const ornament = await makeOrnament('QATEST-PAN-003', 250000);
  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'QA PAN Customer', Payment_Mode: 'Cash', PAN_Number: 'abcde1234f', // lowercase — must still be normalized/accepted
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 250000 }],
  });
  expect(res.status).toBe(201);
  expect(res.body.data.sale.PAN_Number).toBe('ABCDE1234F');
  expect(res.body.data.sale.PAN_Verified).toBe(true);
});

test('a sale below ₹2,00,000 does not require a PAN at all', async () => {
  const ornament = await makeOrnament('QATEST-PAN-004', 50000);
  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'QA PAN Customer', Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 50000 }],
  });
  expect(res.status).toBe(201);
  expect(res.body.data.sale.PAN_Verified).toBe(false);
});
