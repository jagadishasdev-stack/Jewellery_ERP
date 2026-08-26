/**
 * GET /api/reports/gst-summary used to return one blended total_gst with
 * no CGST/SGST/IGST split (despite those columns existing on
 * tbl_sales_header for exactly this) and gstRate:3 hardcoded in the
 * response regardless of what any invoice was actually billed at.
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

async function sellOneItem(price, articleNumber, customerId) {
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: price * 0.8, Total_Price: price, Article_Number: articleNumber,
  });
  // GST_Amount/Taxable_Value are sent by the client per line item (POS
  // computes these) — not auto-derived server-side from Total_Line_Price.
  const gstAmount = Math.round(price * 0.03 * 100) / 100;
  return request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash', Customer_ID: customerId || undefined,
    items: [{
      Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: articleNumber,
      Total_Line_Price: price, Taxable_Value: price, GST_Percentage_Applied: 3, GST_Amount: gstAmount,
    }],
  });
}

test('gst-summary splits CGST/SGST separately from a single blended total, with no hardcoded gstRate', async () => {
  const today = new Date().toISOString().slice(0, 10);
  await sellOneItem(50000, 'QAGSTSPLIT-1');

  const res = await request(app).get('/api/reports/gst-summary').set(auth()).query({ fromDate: today, toDate: today });
  expect(res.status).toBe(200);
  expect(res.body.data.gstRate).toBeUndefined(); // the fabricated field is gone
  expect(parseFloat(res.body.data.total_cgst)).toBeGreaterThan(0);
  expect(parseFloat(res.body.data.total_sgst)).toBeGreaterThan(0);
  // Intra-state (tenant and a walk-in customer with no state on file) —
  // CGST + SGST should equal the total, IGST should be 0.
  expect(parseFloat(res.body.data.total_cgst) + parseFloat(res.body.data.total_sgst)).toBeCloseTo(parseFloat(res.body.data.total_gst), 1);
});

test('gst-summary splits B2B (customer has a GSTIN) from B2C', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const b2bCustomer = await request(app).post('/api/customers').set(auth()).send({
    Customer_Name: 'QA GST B2B Customer', Mobile_1: '9992223331', GST_No: '29ABCDE1234F1Z5',
  });
  const b2cCustomer = await request(app).post('/api/customers').set(auth()).send({
    Customer_Name: 'QA GST B2C Customer', Mobile_1: '9992223332',
  });

  await sellOneItem(30000, 'QAGSTSPLIT-B2B', b2bCustomer.body.data.Customer_ID);
  await sellOneItem(20000, 'QAGSTSPLIT-B2C', b2cCustomer.body.data.Customer_ID);

  const res = await request(app).get('/api/reports/gst-summary').set(auth()).query({ fromDate: today, toDate: today });
  expect(res.body.data.b2b.invoice_count).toBeGreaterThanOrEqual(1);
  expect(res.body.data.b2c.invoice_count).toBeGreaterThanOrEqual(1);
  expect(parseFloat(res.body.data.b2b.taxable_value)).toBeGreaterThan(0);
});
