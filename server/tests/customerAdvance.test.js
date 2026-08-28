/**
 * server/src/routes/customerAdvance.js — per-customer advance subledger
 * (record an advance receipt, check balance, FIFO-apply against a real
 * bill). 3 endpoints, previously zero coverage — real money, real
 * double-entry accounting.
 *
 * FIXED as part of this pass: POST / (record an advance) did a bare
 * insert into tbl_customer_advance, then a SEPARATE, unwrapped
 * postJournal() call. If the ledger post failed for any reason, the
 * advance row was already committed as a real, spendable Active balance
 * with NO accounting trail behind it — while the caller got a 500
 * suggesting nothing happened at all. postJournal() already supports an
 * explicit `trx` to reuse for exactly this (see its own doc comment in
 * accountingEngine.js), and this file's own sibling route
 * (/:customerId/apply) already used a transaction for the same reason.
 * Now both are wrapped in one transaction, matching /apply's convention.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, customerId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  const [customer] = await db('tbl_customer_master').insert({
    Tenant_ID: tenant.tenantId, Customer_Code: 'QACADV-1', Customer_Name: 'QA Advance Customer', Mobile_1: '9822200001', Created_By: 'test',
  }).returning('*');
  customerId = customer.Customer_ID;
});

afterAll(async () => {
  await db('tbl_customer_advance_application').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_customer_advance').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_sales_payments').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_sales_header').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

async function createSale(netPayable) {
  const [sale] = await db('tbl_sales_header').insert({
    Tenant_ID: tenant.tenantId, Branch_ID: tenant.branchId, Invoice_Number: `QACADV-INV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    Sale_Date: new Date(), Customer_ID: customerId, Customer_Name: 'QA Advance Customer',
    Subtotal_Amount: netPayable, Net_Payable_Amount: netPayable, Balance_Amount: netPayable, Amount_Paid: 0, Payment_Status: 'Pending',
    Created_By: 'test',
  }).returning('*');
  return sale;
}

describe('POST /api/customer-advance', () => {
  test('validates required fields', async () => {
    const res = await request(app).post('/api/customer-advance').set(auth()).send({});
    expect(res.status).toBe(422);
  });

  test('404s for a nonexistent customer', async () => {
    const res = await request(app).post('/api/customer-advance').set(auth())
      .send({ Customer_ID: 9999999, Amount: 5000, Payment_Mode: 'Cash' });
    expect(res.status).toBe(404);
  });

  test('FIXED: records a real advance atomically — the row, its journal, and the response all agree', async () => {
    const res = await request(app).post('/api/customer-advance').set(auth())
      .send({ Customer_ID: customerId, Amount: 10000, Payment_Mode: 'Cash', Purpose: 'QA test advance' });
    expect(res.status).toBe(201);
    expect(res.body.data.Balance_Amount == 10000 || Number(res.body.data.Balance_Amount) === 10000).toBe(true);
    expect(res.body.data.Status).toBe('Active');
    expect(res.body.data.Reference).toMatch(new RegExp(`^ADV-${tenant.tenantId.replace('_', '')}-`));

    const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Source_Type: 'CUSTOMER_ADVANCE', Source_ID: res.body.data.Advance_ID }).first();
    expect(journal).toBeTruthy(); // the ledger trail really exists, not just the subledger row

    const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });
    expect(entries.length).toBe(2);
    const dr = entries.find(e => e.Entry_Type === 'Dr');
    const cr = entries.find(e => e.Entry_Type === 'Cr');
    expect(Number(dr.Amount)).toBe(10000);
    expect(Number(cr.Amount)).toBe(10000);
    expect(cr.Ledger_Account).toBe('Customer Advance Account');
  });
});

describe('GET /api/customer-advance/balance/:customerId', () => {
  test('sums only Active advances with a remaining balance for this customer', async () => {
    const res = await request(app).get(`/api/customer-advance/balance/${customerId}`).set(auth());
    expect(res.status).toBe(200);
    expect(Number(res.body.data.total_available)).toBe(10000);
    expect(res.body.data.advances.length).toBe(1);
  });

  test('a customer with no advances at all gets a clean zero, not an error', async () => {
    const [other] = await db('tbl_customer_master').insert({
      Tenant_ID: tenant.tenantId, Customer_Code: 'QACADV-2', Customer_Name: 'QA No Advance Customer', Mobile_1: '9822200002', Created_By: 'test',
    }).returning('*');
    const res = await request(app).get(`/api/customer-advance/balance/${other.Customer_ID}`).set(auth());
    expect(res.status).toBe(200);
    expect(Number(res.body.data.total_available)).toBe(0);
    expect(res.body.data.advances).toEqual([]);
    await db('tbl_customer_master').where({ Customer_ID: other.Customer_ID }).del();
  });
});

describe('POST /api/customer-advance/:customerId/apply', () => {
  test('validates required fields', async () => {
    const res = await request(app).post(`/api/customer-advance/${customerId}/apply`).set(auth()).send({});
    expect(res.status).toBe(422);
  });

  test('404s for an unknown invoice number', async () => {
    const res = await request(app).post(`/api/customer-advance/${customerId}/apply`).set(auth())
      .send({ Invoice_Number: 'NO-SUCH-INVOICE', Amount: 100 });
    expect(res.status).toBe(404);
  });

  test('400s when the requested amount exceeds the customer\'s available advance', async () => {
    const sale = await createSale(5000);
    const res = await request(app).post(`/api/customer-advance/${customerId}/apply`).set(auth())
      .send({ Invoice_Number: sale.Invoice_Number, Amount: 999999 });
    expect(res.status).toBe(400);
    await db('tbl_sales_header').where({ Sale_ID: sale.Sale_ID }).del();
  });

  test('applies advance fully within the invoice balance — no refund, invoice partially paid', async () => {
    const sale = await createSale(6000);
    const res = await request(app).post(`/api/customer-advance/${customerId}/apply`).set(auth())
      .send({ Invoice_Number: sale.Invoice_Number, Amount: 4000 });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.applied_to_invoice)).toBe(4000);
    expect(Number(res.body.data.refund_amount)).toBe(0);
    expect(Number(res.body.data.invoice_balance_remaining)).toBe(2000);

    const updatedSale = await db('tbl_sales_header').where({ Sale_ID: sale.Sale_ID }).first();
    expect(Number(updatedSale.Balance_Amount)).toBe(2000);
    expect(updatedSale.Payment_Status).toBe('Partial');

    const balance = await request(app).get(`/api/customer-advance/balance/${customerId}`).set(auth());
    expect(Number(balance.body.data.total_available)).toBe(6000); // 10000 - 4000

    const applications = await db('tbl_customer_advance_application').where({ Tenant_ID: tenant.tenantId, Sale_ID: sale.Sale_ID });
    expect(applications.length).toBe(1);
    expect(Number(applications[0].Amount_Applied)).toBe(4000);
  });

  test('applying more than the invoice owes produces a real refund for the difference', async () => {
    const sale = await createSale(1000);
    const res = await request(app).post(`/api/customer-advance/${customerId}/apply`).set(auth())
      .send({ Invoice_Number: sale.Invoice_Number, Amount: 3000 });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.applied_to_invoice)).toBe(1000);
    expect(Number(res.body.data.refund_amount)).toBe(2000);
    expect(Number(res.body.data.invoice_balance_remaining)).toBe(0);

    const updatedSale = await db('tbl_sales_header').where({ Sale_ID: sale.Sale_ID }).first();
    expect(updatedSale.Payment_Status).toBe('Paid');
  });

  test('draws down FIFO across multiple advance receipts, oldest first', async () => {
    // Remaining balance after the two applications above: 6000 - 3000 = 3000
    // on the original receipt. Add a second, newer receipt.
    const second = await request(app).post('/api/customer-advance').set(auth())
      .send({ Customer_ID: customerId, Amount: 5000, Payment_Mode: 'Cash' });
    const firstAdvanceId = (await db('tbl_customer_advance').where({ Tenant_ID: tenant.tenantId, Customer_ID: customerId }).orderBy('Created_Date', 'asc').first()).Advance_ID;

    const sale = await createSale(7000); // more than the oldest receipt alone (3000) — must draw from both
    const res = await request(app).post(`/api/customer-advance/${customerId}/apply`).set(auth())
      .send({ Invoice_Number: sale.Invoice_Number, Amount: 7000 });
    expect(res.status).toBe(201);

    const oldest = await db('tbl_customer_advance').where({ Advance_ID: firstAdvanceId }).first();
    expect(Number(oldest.Balance_Amount)).toBe(0);
    expect(oldest.Status).toBe('Fully Applied'); // fully drawn down first

    const applications = await db('tbl_customer_advance_application').where({ Tenant_ID: tenant.tenantId, Sale_ID: sale.Sale_ID }).orderBy('Advance_ID');
    expect(applications.length).toBe(2); // touched both receipts
  });
});
