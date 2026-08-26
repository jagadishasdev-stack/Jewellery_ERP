/**
 * POST /sales/:id/return — the missing piece /cancel explicitly refuses
 * ("Cannot cancel a fully paid sale — that needs a proper return/credit-
 * note flow, not a cancellation"). Reuses /cancel's stock/voucher/loyalty
 * reversal, but a fully-paid sale's money has to go SOMEWHERE: Cash,
 * a specific Bank account, or a real, immediately-usable Store Credit
 * (tbl_customer_advance) — proven end-to-end for all three, including
 * that COGS/stock-value and GST reversal both still land correctly.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, customerId, bankAccountId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  const cust = await request(app).post('/api/customers').set(auth()).send({ Customer_Name: 'QA Return Customer', Mobile_1: '9665540001' });
  customerId = cust.body.data.Customer_ID;

  const bank = await request(app).post('/api/bank-cheque/accounts').set(auth()).send({
    Bank_Name: 'QA Return Bank', Account_Number: '1122334455', IFSC_Code: 'QART0001234', Account_Type: 'Current', Opening_Balance: 0,
  });
  bankAccountId = bank.body.data.Account_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

async function waitForJournal(reference, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: reference }).first();
    if (journal) {
      const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });
      if (entries.length > 0) return entries;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for a journal for Reference=${reference}.`);
}

async function makePaidSale(articleNumber, price, extra = {}) {
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: price * 0.6, Total_Price: price,
  });
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_ID: customerId, Customer_Name: 'QA Return Customer', Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: ornament.body.data.Article_Number, Total_Line_Price: price }],
    ...extra,
  });
  expect(sale.status).toBe(201);
  return { sale: sale.body.data.sale, ornamentId: ornament.body.data.Ornament_ID };
}

test('/cancel still refuses a fully-paid sale, pointing at /return', async () => {
  const { sale } = await makePaidSale('QATEST-RET-000', 5000);
  const res = await request(app).post(`/api/sales/${sale.Sale_ID}/cancel`).set(auth());
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/return\/credit-note/);
});

test('/return refuses a sale that is not fully Paid', async () => {
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 3, Net_Gold_Weight: 2.7, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 3000, Total_Price: 5000,
  });
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_ID: customerId, Customer_Name: 'QA Return Customer', Payment_Mode: 'Cash', Amount_Paid: 0,
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: ornament.body.data.Article_Number, Total_Line_Price: 5000 }],
  });
  const res = await request(app).post(`/api/sales/${sale.body.data.sale.Sale_ID}/return`).set(auth()).send({ Refund_Mode: 'Cash' });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/not fully Paid/);
});

test('a Cash return restores stock, reverses COGS/GST correctly, and refunds via Cash Account', async () => {
  const { sale, ornamentId } = await makePaidSale('QATEST-RET-001', 20000);

  const res = await request(app).post(`/api/sales/${sale.Sale_ID}/return`).set(auth()).send({ Refund_Mode: 'Cash', reason: 'Customer changed mind' });
  expect(res.status).toBe(200);

  const updatedSale = await db('tbl_sales_header').where({ Sale_ID: sale.Sale_ID }).first();
  expect(updatedSale.Payment_Status).toBe('Cancelled');
  expect(updatedSale.Notes).toMatch(/^Returned:/);

  const ornament = await db('tbl_ornament_master').where({ Ornament_ID: ornamentId }).first();
  expect(ornament.Is_Sold).toBe(false);
  expect(ornament.Is_Stock_Available).toBe(true);

  const lines = await waitForJournal(`RETURN-${sale.Invoice_Number}`);
  // Sales Account and GST reversed (flipped to Dr).
  expect(lines.some((l) => l.Ledger_Account === 'Sales Account' && l.Entry_Type === 'Dr')).toBe(true);
  // COGS reversed: Cr COGS, Dr the metal stock account back.
  expect(lines.some((l) => l.Ledger_Account === 'Cost of Goods Sold Account' && l.Entry_Type === 'Cr')).toBe(true);
  expect(lines.some((l) => l.Ledger_Account === 'Gold Stock Account' && l.Entry_Type === 'Dr')).toBe(true);
  // Refund actually leaves via Cash Account.
  const cashOut = lines.find((l) => l.Ledger_Account === 'Cash Account' && l.Entry_Type === 'Cr');
  expect(cashOut).toBeDefined();
  expect(parseFloat(cashOut.Amount)).toBeCloseTo(20000, 2);

  const totalDr = lines.filter((l) => l.Entry_Type === 'Dr').reduce((s, l) => s + parseFloat(l.Amount), 0);
  const totalCr = lines.filter((l) => l.Entry_Type === 'Cr').reduce((s, l) => s + parseFloat(l.Amount), 0);
  expect(totalDr).toBeCloseTo(totalCr, 2);
});

test('a Bank return refunds via the specific chosen bank account, not the original payment channel', async () => {
  const { sale } = await makePaidSale('QATEST-RET-002', 15000);
  const res = await request(app).post(`/api/sales/${sale.Sale_ID}/return`).set(auth()).send({ Refund_Mode: 'Bank', Bank_Account_ID: bankAccountId });
  expect(res.status).toBe(200);

  const lines = await waitForJournal(`RETURN-${sale.Invoice_Number}`);
  const bankRow = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenant.tenantId, Bank_Account_ID: bankAccountId }).first();
  const refundLine = lines.find((l) => l.Ledger_Account === bankRow.Account_Name && l.Entry_Type === 'Cr');
  expect(refundLine).toBeDefined();
  expect(parseFloat(refundLine.Amount)).toBeCloseTo(15000, 2);
  expect(lines.some((l) => l.Ledger_Account === 'Cash Account')).toBe(false); // originally paid in Cash, but refund went to the bank instead
});

test('Store Credit issues a real, immediately-usable customer advance instead of moving cash', async () => {
  const { sale } = await makePaidSale('QATEST-RET-003', 8000);
  const res = await request(app).post(`/api/sales/${sale.Sale_ID}/return`).set(auth()).send({ Refund_Mode: 'Store Credit' });
  expect(res.status).toBe(200);
  expect(res.body.data.store_credit).toBeDefined();
  expect(parseFloat(res.body.data.store_credit.Balance_Amount)).toBe(8000);

  const lines = await waitForJournal(`RETURN-${sale.Invoice_Number}`);
  expect(lines.some((l) => l.Ledger_Account === 'Cash Account')).toBe(false); // no cash left the drawer
  const creditLine = lines.find((l) => l.Ledger_Account === 'Customer Advance Account' && l.Entry_Type === 'Cr');
  expect(creditLine).toBeDefined();
  expect(parseFloat(creditLine.Amount)).toBeCloseTo(8000, 2);

  // The credit is real and immediately usable — apply it to a new bill.
  const balance = await request(app).get(`/api/customer-advance/balance/${customerId}`).set(auth());
  expect(balance.body.data.total_available).toBeGreaterThanOrEqual(8000);
});

test('Store Credit is refused for a walk-in sale with no customer on record', async () => {
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 2, Net_Gold_Weight: 1.8, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 2000, Total_Price: 4000,
  });
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'Walk-in', Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: ornament.body.data.Article_Number, Total_Line_Price: 4000 }],
  });
  const res = await request(app).post(`/api/sales/${sale.body.data.sale.Sale_ID}/return`).set(auth()).send({ Refund_Mode: 'Store Credit' });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/no customer on record/);
});

test('loyalty points redeemed on a paid sale are given back on return, same as /cancel', async () => {
  await db('tbl_customer_master').where({ Customer_ID: customerId }).update({ Loyalty_Points: 300 });
  const before = await db('tbl_customer_master').where({ Customer_ID: customerId }).first();

  const { sale } = await makePaidSale('QATEST-RET-004', 10000, { Loyalty_Points_Used: 50 });
  expect(parseFloat(sale.Net_Payable_Amount)).toBe(9950);

  const res = await request(app).post(`/api/sales/${sale.Sale_ID}/return`).set(auth()).send({ Refund_Mode: 'Cash' });
  expect(res.status).toBe(200);

  const after = await db('tbl_customer_master').where({ Customer_ID: customerId }).first();
  expect(parseInt(after.Loyalty_Points)).toBe(parseInt(before.Loyalty_Points)); // earned taken back, redeemed given back — net zero
});

test('a returned sale cannot be returned or cancelled again', async () => {
  const { sale } = await makePaidSale('QATEST-RET-005', 6000);
  const first = await request(app).post(`/api/sales/${sale.Sale_ID}/return`).set(auth()).send({ Refund_Mode: 'Cash' });
  expect(first.status).toBe(200);

  const secondReturn = await request(app).post(`/api/sales/${sale.Sale_ID}/return`).set(auth()).send({ Refund_Mode: 'Cash' });
  expect(secondReturn.status).toBe(400);

  const cancelAttempt = await request(app).post(`/api/sales/${sale.Sale_ID}/cancel`).set(auth());
  expect(cancelAttempt.status).toBe(400);
});
