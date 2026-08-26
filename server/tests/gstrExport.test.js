/**
 * GET /reports/gstr1 and /reports/gstr3b — the gst-summary route
 * deliberately stopped at a plain B2B/B2C split ("that's a real,
 * separate feature"). These are that feature: real GSTR-1 return tables
 * (B2B, B2CL, B2CS, HSN summary via the real Type_ID FK, document
 * summary) and GSTR-3B's outward-supply + ITC sections, built from real
 * sales/purchase/ledger data — not a GSTN JSON upload file (see the
 * route's own comments for why that's explicitly out of scope).
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId;
const auth = () => ({ Authorization: `Bearer ${token}` });
const today = require('dayjs')().format('YYYY-MM-DD');

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;
  await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).update({ State: 'Karnataka' });
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

async function makeSale(articleNumber, price, gstPercent, customerId, extra = {}) {
  const gstAmount = round2(price * gstPercent / 100);
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: price * 0.6, Total_Price: price,
  });
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_ID: customerId || undefined, Customer_Name: 'QA GSTR Customer', Payment_Mode: 'Cash',
    items: [{
      Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: ornament.body.data.Article_Number,
      Total_Line_Price: price, Taxable_Value: price, GST_Percentage_Applied: gstPercent, GST_Amount: gstAmount,
    }],
    ...extra,
  });
  expect(sale.status).toBe(201);
  return sale.body.data.sale;
}
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

test('a B2B sale (customer has a GSTIN) lands in the B2B table with the right GSTIN and rate', async () => {
  const cust = await request(app).post('/api/customers').set(auth()).send({
    Customer_Name: 'QA B2B Customer', Mobile_1: '9773310001', GST_No: '29ABCDE1234F1Z5', State: 'Karnataka',
  });
  const sale = await makeSale('QATEST-GSTR-001', 20000, 3, cust.body.data.Customer_ID);

  const res = await request(app).get('/api/reports/gstr1').set(auth()).query({ fromDate: today, toDate: today });
  expect(res.status).toBe(200);
  const row = res.body.data.b2b.find((r) => r.invoice_number === sale.Invoice_Number);
  expect(row).toBeDefined();
  expect(row.gstin).toBe('29ABCDE1234F1Z5');
  expect(row.rate).toBeCloseTo(3, 1);
  expect(row.taxable_value).toBe(20000);
});

test('an interstate unregistered sale over ₹2.5L lands in B2CL, not B2CS', async () => {
  await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).update({ State: 'Karnataka' });
  const cust = await request(app).post('/api/customers').set(auth()).send({
    Customer_Name: 'QA B2CL Customer', Mobile_1: '9773310002', State: 'Maharashtra', // different from tenant's state -> interstate
  });
  const sale = await makeSale('QATEST-GSTR-002', 300000, 3, cust.body.data.Customer_ID, { PAN_Number: 'ABCDE1234F' }); // >= 2L requires a PAN
  expect(sale.Is_Interstate).toBe(true);

  const res = await request(app).get('/api/reports/gstr1').set(auth()).query({ fromDate: today, toDate: today });
  const inB2cl = res.body.data.b2cl.find((r) => r.invoice_number === sale.Invoice_Number);
  const inB2b = res.body.data.b2b.find((r) => r.invoice_number === sale.Invoice_Number);
  expect(inB2cl).toBeDefined();
  expect(inB2b).toBeUndefined();
  expect(parseFloat(inB2cl.igst)).toBeGreaterThan(0);
});

test('a walk-in (no customer) intrastate sale is aggregated into B2CS by rate/state, not listed invoice-wise', async () => {
  const before = await request(app).get('/api/reports/gstr1').set(auth()).query({ fromDate: today, toDate: today });
  const beforeRow = before.body.data.b2cs.find((r) => r.place_of_supply === 'Unknown' && Math.abs(r.rate - 3) < 0.5);
  const beforeCount = beforeRow?.invoice_count || 0;

  await makeSale('QATEST-GSTR-003', 5000, 3, null);

  const after = await request(app).get('/api/reports/gstr1').set(auth()).query({ fromDate: today, toDate: today });
  const afterRow = after.body.data.b2cs.find((r) => r.place_of_supply === 'Unknown' && Math.abs(r.rate - 3) < 0.5);
  expect(afterRow).toBeDefined();
  expect(afterRow.invoice_count).toBe(beforeCount + 1);
});

test('HSN summary resolves the real HSN code via the Ornament -> Type_ID -> HSN_Code chain', async () => {
  const itemType = await db('tbl_item_type_master').where({ Type_ID: typeId }).first();
  await makeSale('QATEST-GSTR-004', 8000, 3, null);

  const res = await request(app).get('/api/reports/gstr1').set(auth()).query({ fromDate: today, toDate: today });
  const hsnRow = res.body.data.hsnSummary.find((r) => r.hsn_code === (itemType.HSN_Code || '7113'));
  expect(hsnRow).toBeDefined();
  expect(parseInt(hsnRow.total_quantity)).toBeGreaterThan(0);
});

test('document summary reports total and cancelled invoice counts for the period', async () => {
  const sale = await makeSale('QATEST-GSTR-005', 4000, 3, null, { Amount_Paid: 0 }); // unpaid -> cancellable
  await request(app).post(`/api/sales/${sale.Sale_ID}/cancel`).set(auth()).send({ reason: 'test' });

  const res = await request(app).get('/api/reports/gstr1').set(auth()).query({ fromDate: today, toDate: today });
  expect(res.body.data.docSummary.total_count).toBeGreaterThan(0);
  expect(res.body.data.docSummary.cancelled_count).toBeGreaterThanOrEqual(1);
});

test('GSTR-3B reports real outward-supply totals and nets ITC against a real purchase', async () => {
  const supplier = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA GSTR3B Supplier', Vendor_Type: 'Supplier', Mobile_1: '9773310003',
  });
  await request(app).post('/api/purchase/create').set(auth()).send({
    Supplier_ID: supplier.body.data.Vendor_ID, Purchase_Date: today, Purchase_Type: 'Gold',
    Subtotal_Amount: 50000, GST_Amount: 1500, Total_Amount: 51500,
    items: [{ Item_Description: 'Gold bar', Metal_Type: 'Gold', Gross_Weight: 8, Purity_Code: '916', Gold_Rate: 6250, Purchase_Rate: 50000 }],
  });

  const res = await request(app).get('/api/reports/gstr3b').set(auth()).query({ fromDate: today, toDate: today });
  expect(res.status).toBe(200);
  expect(res.body.data.outward_taxable_supplies.taxable_value).toBeGreaterThan(0);
  expect(res.body.data.itc_available.cgst).toBeCloseTo(750, 1); // 1500/2
  expect(res.body.data.itc_available.sgst).toBeCloseTo(750, 1);
  const payable = res.body.data.tax_payable;
  expect(payable.cgst).toBeGreaterThanOrEqual(0);
  expect(payable.sgst).toBeGreaterThanOrEqual(0);
});
