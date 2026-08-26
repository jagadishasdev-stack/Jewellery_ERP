/**
 * Cancelling a sale used to only restore stock and flip Payment_Status —
 * it never reversed the sale's accounting journal (GST payable stayed
 * inflated forever), never restored an Old Gold/Gift Voucher balance the
 * sale had consumed, never undid the customer's running totals, and could
 * be called twice. All fixed in POST /api/sales/:id/cancel.
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
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: price, Total_Price: price, Article_Number: articleNumber,
  });
  return res.body.data.Ornament_ID;
}

test('cancelling a partially-paid sale reverses its journal, restores stock, and undoes customer totals', async () => {
  const custRes = await request(app).post('/api/customers').set(auth()).send({ Customer_Name: 'QA Cancel Customer', Mobile_1: '9991112221' });
  const customerId = custRes.body.data.Customer_ID;
  const before = await db('tbl_customer_master').where({ Customer_ID: customerId }).first();

  const ornamentId = await makeOrnament('QACANCEL-1', 30000);
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash', Customer_ID: customerId, Amount_Paid: 20000,
    items: [{ Ornament_ID: ornamentId, Article_Number: 'QACANCEL-1', Total_Line_Price: 30000 }],
    payments: [{ mode: 'Cash', amount: 20000 }],
  });
  expect(sale.status).toBe(201);
  const saleId = sale.body.data.sale.Sale_ID;
  expect(sale.body.data.sale.Payment_Status).toBe('Partial');

  const originalJournal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: sale.body.data.sale.Invoice_Number }).first();
  expect(originalJournal).toBeDefined();

  const cancelRes = await request(app).post(`/api/sales/${saleId}/cancel`).set(auth()).send({ reason: 'Customer changed mind' });
  expect(cancelRes.status).toBe(200);

  // Stock restored
  const ornament = await db('tbl_ornament_master').where({ Ornament_ID: ornamentId }).first();
  expect(ornament.Is_Sold).toBe(false);
  expect(ornament.Is_Stock_Available).toBe(true);

  // Sale marked Cancelled
  const updatedSale = await db('tbl_sales_header').where({ Sale_ID: saleId }).first();
  expect(updatedSale.Payment_Status).toBe('Cancelled');

  // Customer totals fully undone — back to exactly what they were before this sale
  const after = await db('tbl_customer_master').where({ Customer_ID: customerId }).first();
  expect(parseFloat(after.Total_Purchase_Value)).toBe(parseFloat(before.Total_Purchase_Value));
  expect(parseInt(after.Total_Purchase_Count)).toBe(parseInt(before.Total_Purchase_Count));
  expect(parseFloat(after.Loyalty_Points)).toBe(parseFloat(before.Loyalty_Points));

  // A real reversal journal was posted, referencing the original
  const reversalJournal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: `CANCEL-${sale.body.data.sale.Invoice_Number}` }).first();
  expect(reversalJournal).toBeDefined();
  const reversalEntries = await db('tbl_accounting_entries').where({ Journal_ID: reversalJournal.Journal_ID });
  const originalEntries = await db('tbl_accounting_entries').where({ Journal_ID: originalJournal.Journal_ID });
  expect(reversalEntries.length).toBe(originalEntries.length);
  // Every line flipped Dr<->Cr with the same amount
  for (const orig of originalEntries) {
    const flipped = reversalEntries.find((r) => r.Ledger_Account === orig.Ledger_Account && parseFloat(r.Amount) === parseFloat(orig.Amount));
    expect(flipped).toBeDefined();
    expect(flipped.Entry_Type).toBe(orig.Entry_Type === 'Dr' ? 'Cr' : 'Dr');
  }
});

test('cancelling twice is rejected, not double-processed', async () => {
  const ornamentId = await makeOrnament('QACANCEL-2', 15000);
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash', Amount_Paid: 5000,
    items: [{ Ornament_ID: ornamentId, Article_Number: 'QACANCEL-2', Total_Line_Price: 15000 }],
    payments: [{ mode: 'Cash', amount: 5000 }],
  });
  const saleId = sale.body.data.sale.Sale_ID;

  const first = await request(app).post(`/api/sales/${saleId}/cancel`).set(auth());
  expect(first.status).toBe(200);
  const second = await request(app).post(`/api/sales/${saleId}/cancel`).set(auth());
  expect(second.status).toBe(400);
  expect(second.body.message).toMatch(/already cancelled/);
});

test('a fully paid sale cannot be cancelled via this route', async () => {
  const ornamentId = await makeOrnament('QACANCEL-3', 10000);
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash', Amount_Paid: 10000,
    items: [{ Ornament_ID: ornamentId, Article_Number: 'QACANCEL-3', Total_Line_Price: 10000 }],
    payments: [{ mode: 'Cash', amount: 10000 }],
  });
  expect(sale.body.data.sale.Payment_Status).toBe('Paid');
  const cancelRes = await request(app).post(`/api/sales/${sale.body.data.sale.Sale_ID}/cancel`).set(auth());
  expect(cancelRes.status).toBe(400);
  expect(cancelRes.body.message).toMatch(/fully paid/);
});
