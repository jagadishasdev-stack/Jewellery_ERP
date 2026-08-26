/**
 * A Partial/Pending sale's Balance_Amount previously had no way to ever
 * be cleared except a Savings Scheme adjustment — /reports/customer-
 * outstanding showed balances that could never actually be collected.
 * POST /api/sales/:id/receive-payment is that missing route.
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

test('a partial payment reduces the balance and keeps the sale Partial; the final payment marks it Paid, and posts real journals', async () => {
  const ornamentId = await makeOrnament('QARECV-1', 30000);
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash', Amount_Paid: 10000,
    items: [{ Ornament_ID: ornamentId, Article_Number: 'QARECV-1', Total_Line_Price: 30000 }],
    payments: [{ mode: 'Cash', amount: 10000 }],
  });
  const saleId = sale.body.data.sale.Sale_ID;
  const invoiceNumber = sale.body.data.sale.Invoice_Number;
  expect(sale.body.data.sale.Payment_Status).toBe('Partial');
  expect(parseFloat(sale.body.data.sale.Balance_Amount)).toBe(20000);

  const partial = await request(app).post(`/api/sales/${saleId}/receive-payment`).set(auth()).send({ Amount: 12000, Payment_Mode: 'UPI' });
  expect(partial.status).toBe(201);
  expect(partial.body.data.Payment_Status).toBe('Partial');
  expect(partial.body.data.Balance_Amount).toBe(8000);

  const partialJournal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: `RECEIPT-${invoiceNumber}-${partial.body.data.payment.Payment_ID}` }).first();
  expect(partialJournal).toBeDefined();
  const partialEntries = await db('tbl_accounting_entries').where({ Journal_ID: partialJournal.Journal_ID });
  const totalDr = partialEntries.filter(e => e.Entry_Type === 'Dr').reduce((s, e) => s + parseFloat(e.Amount), 0);
  const totalCr = partialEntries.filter(e => e.Entry_Type === 'Cr').reduce((s, e) => s + parseFloat(e.Amount), 0);
  expect(totalDr).toBe(12000);
  expect(totalCr).toBe(12000);

  const final = await request(app).post(`/api/sales/${saleId}/receive-payment`).set(auth()).send({ Amount: 8000, Payment_Mode: 'Cash' });
  expect(final.status).toBe(201);
  expect(final.body.data.Payment_Status).toBe('Paid');
  expect(final.body.data.Balance_Amount).toBe(0);

  const updatedSale = await db('tbl_sales_header').where({ Sale_ID: saleId }).first();
  expect(updatedSale.Payment_Status).toBe('Paid');
  expect(parseFloat(updatedSale.Amount_Paid)).toBe(30000);
});

test('cannot collect more than the outstanding balance', async () => {
  const ornamentId = await makeOrnament('QARECV-2', 10000);
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash', Amount_Paid: 3000,
    items: [{ Ornament_ID: ornamentId, Article_Number: 'QARECV-2', Total_Line_Price: 10000 }],
    payments: [{ mode: 'Cash', amount: 3000 }],
  });
  const res = await request(app).post(`/api/sales/${sale.body.data.sale.Sale_ID}/receive-payment`).set(auth()).send({ Amount: 9000, Payment_Mode: 'Cash' });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/exceeds/);
});

test('cannot receive payment against an already-Paid sale', async () => {
  const ornamentId = await makeOrnament('QARECV-3', 5000);
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash', Amount_Paid: 5000,
    items: [{ Ornament_ID: ornamentId, Article_Number: 'QARECV-3', Total_Line_Price: 5000 }],
    payments: [{ mode: 'Cash', amount: 5000 }],
  });
  const res = await request(app).post(`/api/sales/${sale.body.data.sale.Sale_ID}/receive-payment`).set(auth()).send({ Amount: 100, Payment_Mode: 'Cash' });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/no outstanding balance/);
});
