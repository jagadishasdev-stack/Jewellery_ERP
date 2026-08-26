/**
 * Loyalty_Points_Used was accepted by POST /sales/create and stored on
 * the sale, but never actually reduced what the customer owed — a
 * write-only audit field. Confirms real redemption: reduces Net_Payable
 * by points × tenant.Loyalty_Point_Value, posts a real Dr Loyalty Points
 * Redemption Expense journal line, is rejected if it exceeds the
 * customer's balance, nets correctly against the same sale's own earned
 * points, and is refunded back to the customer if the sale is cancelled.
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

  const cust = await request(app).post('/api/customers').set(auth()).send({ Customer_Name: 'QA Loyalty Customer', Mobile_1: '9776650001' });
  customerId = cust.body.data.Customer_ID;
  await db('tbl_customer_master').where({ Customer_ID: customerId }).update({ Loyalty_Points: 500 });
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

async function waitForJournalLines(reference, timeoutMs = 3000) {
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

async function makeOrnament(articleNumber, price) {
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: price * 0.6, Total_Price: price,
  });
  return ornament.body.data;
}

test('the default Loyalty_Point_Value is ₹1, and redeeming points reduces Net_Payable and posts a real journal line', async () => {
  const ornament = await makeOrnament('QATEST-LOY-001', 20000);
  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_ID: customerId, Customer_Name: 'QA Loyalty Customer', Payment_Mode: 'Cash',
    Loyalty_Points_Used: 200,
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 20000 }],
  });
  expect(res.status).toBe(201);
  const sale = res.body.data.sale;
  expect(parseFloat(sale.Net_Payable_Amount)).toBe(19800); // 20000 - 200*1
  expect(parseInt(sale.Loyalty_Points_Used)).toBe(200);

  const customer = await db('tbl_customer_master').where({ Customer_ID: customerId }).first();
  // 500 - 200 redeemed + 19 earned (floor(19800/1000)) = 319
  expect(parseInt(customer.Loyalty_Points)).toBe(319);

  const lines = await waitForJournalLines(sale.Invoice_Number);
  expect(lines.some((l) => l.Ledger_Account === 'Loyalty Points Redemption Expense Account' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 200)).toBe(true);
  const totalDr = lines.filter((l) => l.Entry_Type === 'Dr').reduce((s, l) => s + parseFloat(l.Amount), 0);
  const totalCr = lines.filter((l) => l.Entry_Type === 'Cr').reduce((s, l) => s + parseFloat(l.Amount), 0);
  expect(totalDr).toBe(totalCr);
});

test('rejects redeeming more points than the customer actually has', async () => {
  const ornament = await makeOrnament('QATEST-LOY-002', 5000);
  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_ID: customerId, Customer_Name: 'QA Loyalty Customer', Payment_Mode: 'Cash',
    Loyalty_Points_Used: 999999,
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 5000 }],
  });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/exceed/);
});

test('rejects redemption when no customer is linked', async () => {
  const ornament = await makeOrnament('QATEST-LOY-003', 5000);
  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'Walk-in', Payment_Mode: 'Cash', Loyalty_Points_Used: 10,
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 5000 }],
  });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/linked customer/);
});

test('a custom tenant Loyalty_Point_Value is honoured', async () => {
  await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).update({ Loyalty_Point_Value: 0.5 });
  const ornament = await makeOrnament('QATEST-LOY-004', 10000);
  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_ID: customerId, Customer_Name: 'QA Loyalty Customer', Payment_Mode: 'Cash',
    Loyalty_Points_Used: 100,
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 10000 }],
  });
  expect(res.status).toBe(201);
  expect(parseFloat(res.body.data.sale.Net_Payable_Amount)).toBe(9950); // 10000 - 100*0.5
  await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).update({ Loyalty_Point_Value: 1 });
});

test('cancelling a sale that redeemed points gives them back to the customer', async () => {
  const before = await db('tbl_customer_master').where({ Customer_ID: customerId }).first();
  const ornament = await makeOrnament('QATEST-LOY-005', 8000);
  // Amount_Paid: 0 — a fully-paid sale can't be cancelled at all (a
  // separate, real, not-yet-built gap: it needs a proper return/credit-
  // note flow instead). This test is isolated to the loyalty-points
  // reversal, so it uses an unpaid sale, which cancel does support.
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_ID: customerId, Customer_Name: 'QA Loyalty Customer', Payment_Mode: 'Cash', Amount_Paid: 0,
    Loyalty_Points_Used: 50,
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 8000 }],
  });
  expect(sale.status).toBe(201);
  const afterSale = await db('tbl_customer_master').where({ Customer_ID: customerId }).first();
  // before - 50 redeemed + 7 earned (floor(7950/1000))
  expect(parseInt(afterSale.Loyalty_Points)).toBe(parseInt(before.Loyalty_Points) - 50 + Math.floor(parseFloat(sale.body.data.sale.Net_Payable_Amount) / 1000));

  const cancel = await request(app).post(`/api/sales/${sale.body.data.sale.Sale_ID}/cancel`).set(auth());
  expect(cancel.status).toBe(200);
  const afterCancel = await db('tbl_customer_master').where({ Customer_ID: customerId }).first();
  expect(parseInt(afterCancel.Loyalty_Points)).toBe(parseInt(before.Loyalty_Points)); // fully restored — earned taken back, redeemed given back
});
