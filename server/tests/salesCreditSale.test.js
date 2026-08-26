/**
 * POST /api/sales/create previously treated an explicit Amount_Paid: 0
 * (a deliberate "nothing paid yet, fully on credit" sale) as if
 * Amount_Paid had been omitted entirely, because `Amount_Paid || finalPayable`
 * treats 0 as falsy — silently recording (and posting to accounting) a
 * credit sale as fully paid instead. Found while seeding Savings Club
 * demo data: a scheme-redemption invoice created with Amount_Paid: 0
 * failed with "A journal needs at least two lines" because the
 * resulting balance computed as 0, so no Customer Receivable line was
 * added, leaving only the Cr Sales Account line with no matching Dr.
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

async function waitForJournalLines(reference, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: reference }).first();
    if (journal) {
      const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });
      if (entries.length > 0) return entries;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for a journal (with entries) for Reference=${reference}.`);
}

test('Amount_Paid: 0 records a real credit sale — full balance owed, Pending status, balanced Dr Receivable/Cr Sales journal', async () => {
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 28000,
  });
  expect(ornament.status).toBe(201);

  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'Credit Sale Test Customer', Customer_Mobile: '9911100099',
    Payment_Mode: 'Cash', Amount_Paid: 0,
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: ornament.body.data.Article_Number, Total_Line_Price: 28000 }],
  });
  expect(res.status).toBe(201);
  const sale = res.body.data.sale;
  expect(parseFloat(sale.Amount_Paid)).toBe(0);
  expect(parseFloat(sale.Balance_Amount)).toBeGreaterThan(0); // used to be 0 — this is the bug
  expect(sale.Payment_Status).toBe('Pending');

  const lines = await waitForJournalLines(sale.Invoice_Number);
  expect(lines.some((l) => l.Ledger_Account === 'Customer Receivable Account' && l.Entry_Type === 'Dr')).toBe(true);
  expect(lines.some((l) => l.Ledger_Account === 'Sales Account' && l.Entry_Type === 'Cr')).toBe(true);
  const totalDr = lines.filter((l) => l.Entry_Type === 'Dr').reduce((s, l) => s + parseFloat(l.Amount), 0);
  const totalCr = lines.filter((l) => l.Entry_Type === 'Cr').reduce((s, l) => s + parseFloat(l.Amount), 0);
  expect(totalDr).toBe(totalCr);
});

test('a credit sale sent WITH an explicit payments[] array containing only a ₹0 line still creates the sale (found while building Customer Advance)', async () => {
  // A different variant of the same "Amount_Paid: 0" edge case above,
  // but via the multi-payment payments[] array a caller like POS can
  // send instead of the flat fields — e.g. {mode:'Cash', amount:0} as a
  // placeholder for "nothing on this leg". The outer `payments.length >
  // 0` check passed, but the >0 amount filter then emptied the array
  // entirely, and `tbl_sales_payments.insert([])` is an empty query in
  // Knex/pg — crashed the whole sale with a 500 instead of just
  // skipping the (correctly) empty payment breakdown.
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 4, Net_Gold_Weight: 3.6, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 15000, Total_Price: 20000,
  });
  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'Zero Payment Array Test Customer', Customer_Mobile: '9911100097',
    Payment_Mode: 'Cash', Amount_Paid: 0, payments: [{ mode: 'Cash', amount: 0 }],
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: ornament.body.data.Article_Number, Total_Line_Price: 20000 }],
  });
  expect(res.status).toBe(201);
  expect(parseFloat(res.body.data.sale.Balance_Amount)).toBeGreaterThan(0);
  expect(res.body.data.payments).toEqual([]); // correctly empty, not a crash
});

test('a sale via the flat Payment_Mode/Amount_Paid fields (no payments[] array) still posts a real, balanced journal', async () => {
  // This used to silently post NO journal at all for any caller that
  // doesn't build a payments[] array (POS always does; other callers may
  // not) — the sale itself recorded fine, but nothing reached Trial
  // Balance/Ledger/Day Book because the resulting journal had only the
  // Cr Sales Account line and postJournal rejected it outright.
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 3, Net_Gold_Weight: 2.8, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 12000, Total_Price: 17000,
  });
  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'Full Payment Test Customer', Customer_Mobile: '9911100098',
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: ornament.body.data.Article_Number, Total_Line_Price: 17000 }],
  });
  expect(res.status).toBe(201);
  const sale = res.body.data.sale;
  expect(parseFloat(sale.Balance_Amount)).toBe(0);
  expect(sale.Payment_Status).toBe('Paid');

  const lines = await waitForJournalLines(sale.Invoice_Number);
  expect(lines.some((l) => l.Ledger_Account === 'Cash Account' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 17000)).toBe(true);
  expect(lines.some((l) => l.Ledger_Account === 'Sales Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 17000)).toBe(true);
});

test('a sale with fractional paise (e.g. ₹7858.49) posts a Round Off line and still balances exactly', async () => {
  // Root cause found while seeding Savings Club demo data: every Dr line
  // (payments, Customer Receivable, etc.) is built from finalPayable =
  // Math.round(netPayable) — a whole rupee — while Sales Account was
  // credited the RAW, unrounded subtotal. Any sale whose net payable
  // wasn't already a whole rupee (almost every real one, once GST/making
  // charges are involved) left Dr and Cr a few paise apart, and
  // postJournal() rejects a journal that doesn't balance EXACTLY — so
  // this silently dropped the whole journal, not just a rounding nuance.
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 1, Net_Gold_Weight: 0.9, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 6000, Total_Price: 7858.49,
  });
  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'Round Off Test Customer', Customer_Mobile: '9911100097',
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: ornament.body.data.Article_Number, Total_Line_Price: 7858.49 }],
  });
  expect(res.status).toBe(201);
  const sale = res.body.data.sale;
  expect(parseFloat(sale.Round_Off_Amount)).not.toBe(0);

  const lines = await waitForJournalLines(sale.Invoice_Number);
  expect(lines.some((l) => l.Ledger_Account === 'Round Off Account')).toBe(true);
  const totalDr = lines.filter((l) => l.Entry_Type === 'Dr').reduce((s, l) => s + parseFloat(l.Amount), 0);
  const totalCr = lines.filter((l) => l.Entry_Type === 'Cr').reduce((s, l) => s + parseFloat(l.Amount), 0);
  expect(Math.round(totalDr * 100)).toBe(Math.round(totalCr * 100)); // exact to the paise
});
