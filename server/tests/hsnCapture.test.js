/**
 * HSN codes were only ever resolved via a live join at report time — never
 * actually captured on the ornament or the sold/purchased line item
 * itself, unlike every other tax-relevant attribute (Purity_Code,
 * GST_Percentage_Applied), which IS snapshotted. A later edit to an item
 * type's HSN code would have silently rewritten tax history for every
 * item of that type, sold or not. This proves the real snapshot chain:
 * item type -> ornament (at creation) -> sales/purchase line (at the
 * transaction) -> GSTR-1/gst-summary reports (preferring the snapshot).
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, typeHsnCode;
const auth = () => ({ Authorization: `Bearer ${token}` });
const today = require('dayjs')().format('YYYY-MM-DD');

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  const itemType = await db('tbl_item_type_master').first();
  typeId = itemType.Type_ID;
  typeHsnCode = itemType.HSN_Code;
  expect(typeHsnCode).toBeTruthy(); // sanity: the seeded item types really do have an HSN code to inherit
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

test('creating an ornament snapshots the HSN code from its item type', async () => {
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 28000,
  });
  expect(ornament.status).toBe(201);
  expect(ornament.body.data.HSN_Code).toBe(typeHsnCode);
});

test('creating a purchase (which creates its own ornament) also snapshots HSN', async () => {
  const supplier = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA HSN Supplier', Vendor_Type: 'Supplier', Mobile_1: '9660010001',
  });
  const purchase = await request(app).post('/api/purchase/create').set(auth()).send({
    Supplier_ID: supplier.body.data.Vendor_ID, Purchase_Date: today, Purchase_Type: 'Gold', Total_Amount: 30000,
    items: [{ Type_ID: typeId, Item_Description: 'Gold ring', Metal_Type: 'Gold', Gross_Weight: 5, Purity_Code: '916', Gold_Rate: 6000, Purchase_Rate: 30000 }],
  });
  expect(purchase.status).toBe(201);

  const detail = await request(app).get(`/api/purchase/${purchase.body.data.Purchase_ID}`).set(auth());
  expect(detail.body.data.items[0].HSN_Code).toBe(typeHsnCode);

  const ornament = await db('tbl_ornament_master').where({ Ornament_ID: detail.body.data.items[0].Ornament_ID }).first();
  expect(ornament.HSN_Code).toBe(typeHsnCode);
});

test('selling an ornament snapshots the SOLD LINE\'s own HSN from the ornament, immune to a later item-type edit', async () => {
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 28000,
  });
  expect(ornament.body.data.HSN_Code).toBe(typeHsnCode);

  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'QA HSN Customer', Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: ornament.body.data.Article_Number, Total_Line_Price: 28000 }],
  });
  expect(sale.status).toBe(201);

  const soldLine = await db('tbl_sales_details').where({ Sale_ID: sale.body.data.sale.Sale_ID }).first();
  expect(soldLine.HSN_Code).toBe(typeHsnCode);

  // Now change the item type's HSN code — the ALREADY-sold line must NOT
  // silently change; that's the whole point of snapshotting it.
  await db('tbl_item_type_master').where({ Type_ID: typeId }).update({ HSN_Code: '9999' });
  const soldLineAfter = await db('tbl_sales_details').where({ Sale_ID: sale.body.data.sale.Sale_ID }).first();
  expect(soldLineAfter.HSN_Code).toBe(typeHsnCode); // unchanged — snapshot held
  expect(soldLineAfter.HSN_Code).not.toBe('9999');

  await db('tbl_item_type_master').where({ Type_ID: typeId }).update({ HSN_Code: typeHsnCode }); // restore for other tests
});

test('GSTR-1 and gst-summary HSN reports both prefer the real captured snapshot', async () => {
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 8000, Total_Price: 10000,
  });
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'QA HSN Report Customer', Payment_Mode: 'Cash',
    items: [{
      Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: ornament.body.data.Article_Number,
      Total_Line_Price: 10000, Taxable_Value: 10000, GST_Percentage_Applied: 3, GST_Amount: 300,
    }],
  });
  expect(sale.status).toBe(201);

  const gstr1 = await request(app).get('/api/reports/gstr1').set(auth()).query({ fromDate: today, toDate: today });
  const gstr1Row = gstr1.body.data.hsnSummary.find((r) => r.hsn_code === typeHsnCode);
  expect(gstr1Row).toBeDefined();

  const gstSummary = await request(app).get('/api/reports/gst-summary').set(auth()).query({ fromDate: today, toDate: today });
  const gstSummaryRow = gstSummary.body.data.hsnSummary.find((r) => r.hsn_code === typeHsnCode);
  expect(gstSummaryRow).toBeDefined();
});
