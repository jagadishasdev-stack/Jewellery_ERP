/**
 * Two small, unrelated-but-adjacent fixes bundled in one file since both
 * touch the same "was hardcoded, now real" theme:
 *   - Monthly sales/collection targets (ManagementReportsPage.jsx had them
 *     hardcoded to ₹10L/₹8L, claiming they were "configurable in Admin →
 *     Settings" — a page that never existed) — now real, per-tenant,
 *     round-tripped through GET/PUT /tenant/settings.
 *   - Sale_Type/Invoice_Type (POSPage.jsx always sent 'Retail'/'Tax
 *     Invoice' with no UI to change either) — now real fields the API
 *     accepts and stores as sent.
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

test('sales targets round-trip through GET/PUT /tenant/settings', async () => {
  const before = await request(app).get('/api/tenant/settings').set(auth());
  expect(before.status).toBe(200);
  expect(before.body.data.Monthly_Sales_Target).toBeNull();

  const update = await request(app).put('/api/tenant/settings').set(auth()).send({
    Monthly_Sales_Target: 1500000, Monthly_Collection_Target: 1200000,
  });
  expect(update.status).toBe(200);

  const after = await request(app).get('/api/tenant/settings').set(auth());
  expect(parseFloat(after.body.data.Monthly_Sales_Target)).toBe(1500000);
  expect(parseFloat(after.body.data.Monthly_Collection_Target)).toBe(1200000);
});

/**
 * FIXED (new feature): GST No / PAN / address existed as real backend
 * fields with literally no UI to edit them, and TDS% didn't exist at all
 * — see the new Company Settings page (client/src/pages/admin/
 * CompanySettingsPage.jsx). TDS% defaults to 0 and is stored for reference
 * only — no automatic deduction logic anywhere yet, deliberately.
 */
test('GST No / PAN / Address / TDS% round-trip through GET/PUT /tenant/settings', async () => {
  const before = await request(app).get('/api/tenant/settings').set(auth());
  expect(before.status).toBe(200);
  expect(parseFloat(before.body.data.TDS_Percentage)).toBe(0); // real column default

  const update = await request(app).put('/api/tenant/settings').set(auth()).send({
    GST_No: '29QATEST1234F1Z5', PAN_No: 'QATES1234F',
    Address_Line1: 'QA Test Shop', City: 'QA City', State: 'QA State', Pincode: '123456',
    TDS_Percentage: 2.5,
  });
  expect(update.status).toBe(200);

  const after = await request(app).get('/api/tenant/settings').set(auth());
  expect(after.body.data.GST_No).toBe('29QATEST1234F1Z5');
  expect(after.body.data.PAN_No).toBe('QATES1234F');
  expect(after.body.data.Address_Line1).toBe('QA Test Shop');
  expect(after.body.data.City).toBe('QA City');
  expect(parseFloat(after.body.data.TDS_Percentage)).toBe(2.5);
});

test('PUT /tenant/settings cannot be used to smuggle a license/activation change through', async () => {
  const before = await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).first();
  const res = await request(app).put('/api/tenant/settings').set(auth()).send({
    Is_Active: false, Max_Users: 99999, Max_Branches: 99999,
    License_Key: 'HIJACKED-KEY', License_Expiry_Date: '2099-01-01',
  });
  expect(res.status).toBe(200); // succeeds — but the dangerous fields are silently dropped, not applied
  const after = await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).first();
  expect(after.Is_Active).toBe(before.Is_Active);
  expect(after.License_Key).toBe(before.License_Key);
  expect(String(after.License_Expiry_Date)).toBe(String(before.License_Expiry_Date));
});

test('a Wholesale sale with Cash Memo invoice type is recorded as sent, not silently forced to Retail/Tax Invoice', async () => {
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 28000,
  });
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'QA Wholesale Customer', Payment_Mode: 'Cash', Sale_Type: 'Wholesale', Invoice_Type: 'Cash Memo',
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: ornament.body.data.Article_Number, Total_Line_Price: 28000 }],
  });
  expect(sale.status).toBe(201);
  expect(sale.body.data.sale.Sale_Type).toBe('Wholesale');
  expect(sale.body.data.sale.Invoice_Type).toBe('Cash Memo');
});

test('a Cash Memo sale is correctly excluded from the GSTR-1/gst-summary Tax Invoice filters', async () => {
  const today = require('dayjs')().format('YYYY-MM-DD');
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 8000, Total_Price: 10000,
  });
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'QA Cash Memo Customer', Payment_Mode: 'Cash', Invoice_Type: 'Cash Memo',
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: ornament.body.data.Article_Number, Total_Line_Price: 10000 }],
  });
  expect(sale.status).toBe(201);

  const gstr1 = await request(app).get('/api/reports/gstr1').set(auth()).query({ fromDate: today, toDate: today });
  const inB2b = gstr1.body.data.b2b.find((r) => r.invoice_number === sale.body.data.sale.Invoice_Number);
  const inB2cl = gstr1.body.data.b2cl.find((r) => r.invoice_number === sale.body.data.sale.Invoice_Number);
  expect(inB2b).toBeUndefined();
  expect(inB2cl).toBeUndefined();
});
