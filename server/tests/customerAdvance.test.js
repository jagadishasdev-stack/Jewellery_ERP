/**
 * Customer Advance — a real, per-customer, lookupable advance ledger.
 * Purchase Hub's Advance Receipt / Advance Adjustment cards only ever
 * printed a paper receipt; there was no generic (not order-tied)
 * customer-advance table anywhere. Proves the full lifecycle: recording
 * an advance posts a real Dr Cash/Cr Customer Advance Account journal,
 * the balance is queryable per customer, applying it against a bill
 * settles the outstanding balance first (and refunds any excess), and
 * it correctly draws down FIFO across more than one receipt.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, customerId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  const cust = await request(app).post('/api/customers').set(auth()).send({ Customer_Name: 'QA Advance Customer', Mobile_1: '9887770001' });
  customerId = cust.body.data.Customer_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

async function waitForJournal(reference, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: reference }).orderBy('Journal_ID', 'desc').first();
    if (journal) {
      const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });
      if (entries.length > 0) return entries;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for a journal for Reference=${reference}.`);
}

async function makeSale(articleNumber, price, amountPaid) {
  const [ornament] = await db('tbl_ornament_master').insert({
    Tenant_ID: tenant.tenantId, Article_Number: articleNumber, Gross_Weight: 2, Net_Gold_Weight: 1.8,
    Current_Gold_Rate: 6000, Base_Making_Charge_Per_Gram: 500, Purchase_Cost: price * 0.7, Stock_Quantity: 1,
    Is_Sold: false, Is_Active: true, Total_Price: price,
  }).returning('Ornament_ID');
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    items: [{ Ornament_ID: ornament.Ornament_ID, Total_Line_Price: price, Gross_Weight: 2, Net_Gold_Weight: 1.8 }],
    Customer_Name: 'QA Advance Customer', Payment_Mode: 'Cash', Amount_Paid: amountPaid,
    payments: [{ mode: 'Cash', amount: amountPaid }],
  });
  return sale.body.data.sale;
}

test('recording an advance posts a real Dr Cash / Cr Customer Advance Account journal', async () => {
  const res = await request(app).post('/api/customer-advance').set(auth()).send({
    Customer_ID: customerId, Amount: 5000, Payment_Mode: 'Cash', Purpose: 'Against future order',
  });
  expect(res.status).toBe(201);
  expect(parseFloat(res.body.data.Balance_Amount)).toBe(5000);

  const entries = await waitForJournal(res.body.data.Reference);
  expect(entries.some((e) => e.Ledger_Account === 'Cash Account' && e.Entry_Type === 'Dr' && parseFloat(e.Amount) === 5000)).toBe(true);
  expect(entries.some((e) => e.Ledger_Account === 'Customer Advance Account' && e.Entry_Type === 'Cr' && parseFloat(e.Amount) === 5000)).toBe(true);

  const balance = await request(app).get(`/api/customer-advance/balance/${customerId}`).set(auth());
  expect(balance.status).toBe(200);
  expect(balance.body.data.total_available).toBe(5000);
});

test('applying an advance settles an outstanding bill first, refunds only what is left over', async () => {
  const sale = await makeSale('QATEST-ADV-001', 4000, 1000); // Balance_Amount = 3000, ₹5000 advance available

  const res = await request(app).post(`/api/customer-advance/${customerId}/apply`).set(auth()).send({
    Invoice_Number: sale.Invoice_Number, Amount: 4500,
  });
  expect(res.status).toBe(201);
  expect(res.body.data.applied_to_invoice).toBe(3000);
  expect(res.body.data.refund_amount).toBe(1500);
  expect(res.body.data.invoice_balance_remaining).toBe(0);

  const updatedSale = await db('tbl_sales_header').where({ Sale_ID: sale.Sale_ID }).first();
  expect(parseFloat(updatedSale.Balance_Amount)).toBe(0);
  expect(updatedSale.Payment_Status).toBe('Paid');

  const balance = await request(app).get(`/api/customer-advance/balance/${customerId}`).set(auth());
  expect(balance.body.data.total_available).toBe(500); // 5000 - 4500

  const entries = await waitForJournal(sale.Invoice_Number);
  expect(entries.some((e) => e.Ledger_Account === 'Customer Advance Account' && e.Entry_Type === 'Dr' && parseFloat(e.Amount) === 4500)).toBe(true);
  expect(entries.some((e) => e.Ledger_Account === 'Customer Receivable Account' && e.Entry_Type === 'Cr' && parseFloat(e.Amount) === 3000)).toBe(true);
  expect(entries.some((e) => e.Ledger_Account === 'Cash Account' && e.Entry_Type === 'Cr' && parseFloat(e.Amount) === 1500)).toBe(true);
  expect(entries.some((e) => e.Ledger_Account === 'Sales Account')).toBe(false); // revenue already booked at sale time
});

test('rejects applying more than the customer actually has available', async () => {
  const sale = await makeSale('QATEST-ADV-002', 10000, 0);
  const res = await request(app).post(`/api/customer-advance/${customerId}/apply`).set(auth()).send({
    Invoice_Number: sale.Invoice_Number, Amount: 999999, // only ₹500 left
  });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/exceeds/);
});

test('draws down FIFO across multiple advance receipts for the same customer', async () => {
  const cust = await request(app).post('/api/customers').set(auth()).send({ Customer_Name: 'QA FIFO Advance Customer', Mobile_1: '9887770002' });
  const custId = cust.body.data.Customer_ID;

  const first = await request(app).post('/api/customer-advance').set(auth()).send({ Customer_ID: custId, Amount: 1000, Payment_Mode: 'Cash' });
  const second = await request(app).post('/api/customer-advance').set(auth()).send({ Customer_ID: custId, Amount: 2000, Payment_Mode: 'Cash' });

  const sale = await makeSale('QATEST-ADV-003', 1500, 0);
  const apply = await request(app).post(`/api/customer-advance/${custId}/apply`).set(auth()).send({ Invoice_Number: sale.Invoice_Number, Amount: 1500 });
  expect(apply.status).toBe(201);

  const firstRow = await db('tbl_customer_advance').where({ Advance_ID: first.body.data.Advance_ID }).first();
  const secondRow = await db('tbl_customer_advance').where({ Advance_ID: second.body.data.Advance_ID }).first();
  expect(parseFloat(firstRow.Balance_Amount)).toBe(0); // fully drained first (FIFO)
  expect(firstRow.Status).toBe('Fully Applied');
  expect(parseFloat(secondRow.Balance_Amount)).toBe(1500); // only 500 of the 2000 taken, 1500 left

  const applications = await db('tbl_customer_advance_application').where({ Sale_ID: sale.Sale_ID }).orderBy('Advance_ID', 'asc');
  expect(applications.length).toBe(2);
  expect(parseFloat(applications[0].Amount_Applied)).toBe(1000);
  expect(parseFloat(applications[1].Amount_Applied)).toBe(500);
});
