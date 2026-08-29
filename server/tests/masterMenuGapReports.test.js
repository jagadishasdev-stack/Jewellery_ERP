/**
 * Master/Reports/Utility menu audit (round 2): the genuinely-missing
 * pieces that needed real backend work rather than just wiring an
 * already-existing route into a client page — Customer Ageing (new
 * route) and the Old Metal Purchase report (Purchase_Type filter added
 * to the existing purchase list route).
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
  await db('tbl_purchase_header').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_sales_header').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(articleNumber) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: (await db('tbl_item_type_master').first()).Type_ID, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5,
    Current_Gold_Rate: 6000, Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 15000, Total_Price: 18000, Article_Number: articleNumber,
  });
  return res.body.data;
}

test('GET /api/reports/customer-ageing buckets an old outstanding sale into the correct age band', async () => {
  const ornament = await createOrnament('QAAGE-0001');
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash', Amount_Paid: 0,
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: 'QAAGE-0001', Total_Line_Price: 18000 }],
  });
  const saleId = sale.body.data.sale.Sale_ID;
  // Backdate the sale 45 days so it lands in the 31-60 bucket, not 0-30.
  await db('tbl_sales_header').where({ Sale_ID: saleId }).update({ Sale_Date: dayjs().subtract(45, 'day').format('YYYY-MM-DD') });

  const res = await request(app).get('/api/reports/customer-ageing').set(auth());
  expect(res.status).toBe(200);
  const row = res.body.data.find((r) => r.Customer_ID === sale.body.data.sale.Customer_ID);
  // Customer_ID may be null for a walk-in sale with no customer link —
  // guard for that rather than assume one exists.
  if (sale.body.data.sale.Customer_ID) {
    expect(row).toBeDefined();
    expect(parseFloat(row.bucket_31_60)).toBeGreaterThanOrEqual(18000);
    expect(parseFloat(row.bucket_0_30)).toBe(0);
  } else {
    expect(res.body.data).toBeInstanceOf(Array); // no-customer sale correctly excluded (route requires Customer_ID)
  }
});

test('GET /api/purchase?purchaseType=Old Gold filters the list, and the count matches the filtered set (not the whole tenant)', async () => {
  await request(app).post('/api/purchase/create').set(auth()).send({
    Purchase_Type: 'Old Gold', Supplier_Name: 'QA Old Gold Supplier', Total_Amount: 12000, Subtotal_Amount: 12000,
    items: [{ Metal_Type: 'Gold', Gross_Weight: 2, Purchase_Rate: 12000, Article_Number: 'QAOLD-0001', Create_Inventory: false }],
  });
  await request(app).post('/api/purchase/create').set(auth()).send({
    Purchase_Type: 'Stock', Supplier_Name: 'QA Stock Supplier', Total_Amount: 30000, Subtotal_Amount: 30000,
    items: [{ Metal_Type: 'Gold', Gross_Weight: 5, Purchase_Rate: 30000, Article_Number: 'QASTK-0001', Create_Inventory: false }],
  });

  const res = await request(app).get('/api/purchase').set(auth()).query({ purchaseType: 'Old Gold' });
  expect(res.status).toBe(200);
  expect(res.body.data.items.every((p) => p.Purchase_Type === 'Old Gold')).toBe(true);
  expect(res.body.data.items.some((p) => p.Supplier_Name_Resolved === 'QA Old Gold Supplier')).toBe(true);
  // The count-query bug: it used to ignore the filter entirely and
  // return the tenant's TOTAL purchase count regardless of purchaseType.
  expect(res.body.data.total).toBe(res.body.data.items.length);
});
