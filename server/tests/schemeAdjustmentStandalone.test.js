/**
 * Standalone Scheme Adjustment — decoupled from a live POS cart
 * (server/src/routes/savingsScheme.js's /adjust-invoice and /foreclose):
 *
 *   - /adjust-invoice: apply a matured member's scheme balance/bonus
 *     against a bill that's already been created. Settles the invoice's
 *     outstanding balance first; anything left over becomes a real
 *     cash/bank refund.
 *   - /foreclose: a customer stopping their scheme BEFORE it matures —
 *     staff manually enters a deduction (penalty, kept as business
 *     income) and/or a discretionary bonus, then settles the net amount
 *     via Cash, Bank, or against a sale invoice.
 *
 * The most important regression here: settling a PREVIOUSLY-BOOKED
 * invoice balance must credit Customer Receivable Account, never Sales
 * Account again — the invoice's full value was already recognized as
 * revenue at the time of the original sale (with any unpaid remainder
 * parked in Customer Receivable Account). An earlier version of this code
 * credited Sales Account a second time, which double-booked revenue and
 * left Customer Receivable Account permanently overstated — caught by
 * actually running the flow end-to-end and checking Trial Balance, not
 * just checking the API response.
 *
 * Each test checks the SPECIFIC new journal's own Dr/Cr lines (looked up
 * by the Reference the endpoint returns) rather than cumulative Trial
 * Balance totals — this file's tests all share one tenant, so absolute
 * running totals would make each test's expectations depend on test order.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

// The ledger post is fire-and-forget (non-blocking), same convention as
// Sales/Purchase/Day Close — poll for the journal by its own Reference
// (the receipt_number the endpoint returns) rather than assuming it's
// already there the instant the HTTP response resolves.
async function waitForJournalLines(reference, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: reference }).first();
    if (journal) {
      // The journal row and its entry rows are two separate inserts inside
      // postJournal (entries need a getOrCreateAccount round-trip per
      // line first) — the journal can exist for a moment with zero entries
      // yet. Wait for the entries too, not just the journal.
      const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });
      if (entries.length > 0) return entries;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for a journal (with entries) for Reference=${reference}.`);
}

async function makeMaturedMember(mobile) {
  const scheme = await request(app).post('/api/savings/schemes').set(auth()).send({
    Scheme_Code: `QA-${mobile}`, Scheme_Name: `QA Scheme ${mobile}`, Duration_Months: 11, Default_Monthly_Amount: 1000,
  });
  const group = await request(app).post('/api/savings/groups').set(auth()).send({
    Scheme_ID: scheme.body.data.Scheme_ID, Group_Code: `QA-GRP-${mobile}`, Group_Name: `QA Group ${mobile}`,
    Start_Date: '2026-01-01', Monthly_Amount: 1000, Total_Installments: 1, Bonus_Amount: 0,
  });
  const member = await request(app).post('/api/savings/members').set(auth()).send({
    Member_Name: `QA Member ${mobile}`, Mobile: mobile, Scheme_ID: scheme.body.data.Scheme_ID, Group_ID: group.body.data.Group_ID,
    Joining_Date: '2026-01-01', Installment_Amount: 1000,
  });
  await request(app).post('/api/savings/collect').set(auth()).send({ Member_ID: member.body.data.Member_ID, Amount: 1000, Payment_Mode: 'Cash' });
  return member.body.data.Member_ID; // now Matured, ₹1000 available
}

async function makeActiveMember(mobile, installments = 12, bonusAmount = 0, collections = 2) {
  const scheme = await request(app).post('/api/savings/schemes').set(auth()).send({
    Scheme_Code: `QA-${mobile}`, Scheme_Name: `QA Scheme ${mobile}`, Duration_Months: 11, Default_Monthly_Amount: 1000,
  });
  const group = await request(app).post('/api/savings/groups').set(auth()).send({
    Scheme_ID: scheme.body.data.Scheme_ID, Group_Code: `QA-GRP-${mobile}`, Group_Name: `QA Group ${mobile}`,
    Start_Date: '2026-01-01', Monthly_Amount: 1000, Total_Installments: installments, Bonus_Amount: bonusAmount,
  });
  const member = await request(app).post('/api/savings/members').set(auth()).send({
    Member_Name: `QA Member ${mobile}`, Mobile: mobile, Scheme_ID: scheme.body.data.Scheme_ID, Group_ID: group.body.data.Group_ID,
    Joining_Date: '2026-01-01', Installment_Amount: 1000,
  });
  for (let i = 0; i < collections; i++) {
    await request(app).post('/api/savings/collect').set(auth()).send({ Member_ID: member.body.data.Member_ID, Amount: 1000, Payment_Mode: 'Cash' });
  }
  return member.body.data.Member_ID; // still Active
}

async function makeSale(articleNumber, price, amountPaid) {
  const [ornament] = await db('tbl_ornament_master').insert({
    Tenant_ID: tenant.tenantId, Article_Number: articleNumber, Gross_Weight: 2, Net_Gold_Weight: 1.8,
    Current_Gold_Rate: 6000, Base_Making_Charge_Per_Gram: 500, Purchase_Cost: price * 0.7, Stock_Quantity: 1,
    Is_Sold: false, Is_Active: true, Total_Price: price,
  }).returning('Ornament_ID');
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    items: [{ Ornament_ID: ornament.Ornament_ID, Total_Line_Price: price, Gross_Weight: 2, Net_Gold_Weight: 1.8 }],
    Customer_Name: 'Standalone Adjustment Test', Payment_Mode: 'Cash', Amount_Paid: amountPaid,
    payments: [{ mode: 'Cash', amount: amountPaid }],
  });
  return sale.body.data.sale;
}

describe('POST /savings/members/:id/adjust-invoice', () => {
  test('settling an outstanding balance credits Customer Receivable Account, NOT Sales Account again', async () => {
    const memberId = await makeMaturedMember('9911100001');
    const sale = await makeSale('QATEST-STANDALONE-001', 5000, 3000); // Balance_Amount = 2000

    const res = await request(app).post(`/api/savings/members/${memberId}/adjust-invoice`).set(auth()).send({
      Invoice_Number: sale.Invoice_Number, Amount: 600,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.applied_to_invoice).toBe(600);
    expect(res.body.data.refund_amount).toBe(0);
    expect(res.body.data.invoice_balance_remaining).toBe(1400);

    const updatedSale = await db('tbl_sales_header').where({ Sale_ID: sale.Sale_ID }).first();
    expect(parseFloat(updatedSale.Balance_Amount)).toBe(1400);
    expect(updatedSale.Payment_Status).toBe('Partial');

    const lines = await waitForJournalLines(res.body.data.receipt_number);
    expect(lines.some((l) => l.Ledger_Account === 'Customer Scheme Deposit Account' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 600)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Customer Receivable Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 600)).toBe(true);
    // The regression: this journal must NEVER touch Sales Account — that
    // revenue was already booked in full when the sale itself was created.
    expect(lines.some((l) => l.Ledger_Account === 'Sales Account')).toBe(false);
  });

  test('adjusting against an already fully-paid invoice requires a Refund_Mode, then refunds correctly', async () => {
    const memberId = await makeMaturedMember('9911100002');
    const sale = await makeSale('QATEST-STANDALONE-002', 3000, 3000); // Balance_Amount = 0

    const withoutRefundMode = await request(app).post(`/api/savings/members/${memberId}/adjust-invoice`).set(auth()).send({
      Invoice_Number: sale.Invoice_Number, Amount: 400,
    });
    expect(withoutRefundMode.status).toBe(400);
    expect(withoutRefundMode.body.message).toMatch(/already settled/);

    const withRefundMode = await request(app).post(`/api/savings/members/${memberId}/adjust-invoice`).set(auth()).send({
      Invoice_Number: sale.Invoice_Number, Amount: 400, Refund_Mode: 'Cash',
    });
    expect(withRefundMode.status).toBe(201);
    expect(withRefundMode.body.data.applied_to_invoice).toBe(0);
    expect(withRefundMode.body.data.refund_amount).toBe(400);

    const lines = await waitForJournalLines(withRefundMode.body.data.receipt_number);
    expect(lines.some((l) => l.Ledger_Account === 'Cash Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 400)).toBe(true);
    // A pure refund never touches Sales Account OR Customer Receivable Account.
    expect(lines.some((l) => l.Ledger_Account === 'Sales Account')).toBe(false);
    expect(lines.some((l) => l.Ledger_Account === 'Customer Receivable Account')).toBe(false);
  });

  test('rejects an amount exceeding the member\'s available balance', async () => {
    const memberId = await makeMaturedMember('9911100003');
    const sale = await makeSale('QATEST-STANDALONE-003', 5000, 5000);
    const res = await request(app).post(`/api/savings/members/${memberId}/adjust-invoice`).set(auth()).send({
      Invoice_Number: sale.Invoice_Number, Amount: 5000, // only ₹1000 available
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/exceeds/);
  });

  test('404s on an invoice number that does not exist', async () => {
    const memberId = await makeMaturedMember('9911100004');
    const res = await request(app).post(`/api/savings/members/${memberId}/adjust-invoice`).set(auth()).send({
      Invoice_Number: 'INV-DOES-NOT-EXIST', Amount: 100,
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /savings/members/:id/foreclose', () => {
  test('rejects a deduction larger than the amount actually collected', async () => {
    const memberId = await makeActiveMember('9911100010');
    const res = await request(app).post(`/api/savings/members/${memberId}/foreclose`).set(auth()).send({
      Settlement_Mode: 'Cash', Deduction_Amount: 5000,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/can't exceed/);
  });

  test('requires Bank_Account_ID when Settlement_Mode is Bank', async () => {
    const memberId = await makeActiveMember('9911100011');
    const res = await request(app).post(`/api/savings/members/${memberId}/foreclose`).set(auth()).send({ Settlement_Mode: 'Bank' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Bank_Account_ID/);
  });

  test('deduction becomes real income, bonus becomes a real expense, net payout goes to Cash — and it all balances', async () => {
    const memberId = await makeActiveMember('9911100012');
    const res = await request(app).post(`/api/savings/members/${memberId}/foreclose`).set(auth()).send({
      Settlement_Mode: 'Cash', Deduction_Amount: 200, Bonus_Amount: 50, Reason: 'Customer requested early closure',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.available_balance).toBe(2000);
    expect(res.body.data.net_payout).toBe(1850); // 2000 - 200 + 50

    const member = await db('tbl_scheme_members').where({ Member_ID: memberId }).first();
    expect(member.Status).toBe('Closed');
    expect(member.Closure_Reason).toBe('Customer requested early closure');
    expect(parseFloat(member.Amount_Redeemed)).toBe(2000);

    const lines = await waitForJournalLines(res.body.data.receipt_number);
    expect(lines.some((l) => l.Ledger_Account === 'Customer Scheme Deposit Account' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 2000)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Scheme Foreclosure Income Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 200)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Scheme Bonus Expense Account' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 50)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Cash Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 1850)).toBe(true);
    // Dr side (2000 + 50 = 2050) must equal Cr side (200 + 1850 = 2050) — postJournal enforces this on write, this just confirms it landed that way.
    const totalDr = lines.filter((l) => l.Entry_Type === 'Dr').reduce((s, l) => s + parseFloat(l.Amount), 0);
    const totalCr = lines.filter((l) => l.Entry_Type === 'Cr').reduce((s, l) => s + parseFloat(l.Amount), 0);
    expect(totalDr).toBe(totalCr);
  });

  test('an already-closed member cannot be foreclosed again', async () => {
    const memberId = await makeActiveMember('9911100013');
    await request(app).post(`/api/savings/members/${memberId}/foreclose`).set(auth()).send({ Settlement_Mode: 'Cash' });
    const res = await request(app).post(`/api/savings/members/${memberId}/foreclose`).set(auth()).send({ Settlement_Mode: 'Cash' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not Active/);
  });

  test('Settlement_Mode Adjustment splits correctly between settling a bill and refunding the rest — Sales Account untouched', async () => {
    const memberId = await makeActiveMember('9911100014');
    const sale = await makeSale('QATEST-STANDALONE-FORE-001', 4000, 3500); // Balance_Amount = 500, available = 2000

    const res = await request(app).post(`/api/savings/members/${memberId}/foreclose`).set(auth()).send({
      Settlement_Mode: 'Adjustment', Invoice_Number: sale.Invoice_Number, Reason: 'Closing early, adjust against pending bill',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.applied_to_invoice).toBe(500);
    expect(res.body.data.refund_amount).toBe(1500);

    const updatedSale = await db('tbl_sales_header').where({ Sale_ID: sale.Sale_ID }).first();
    expect(parseFloat(updatedSale.Balance_Amount)).toBe(0);
    expect(updatedSale.Payment_Status).toBe('Paid');

    const lines = await waitForJournalLines(res.body.data.receipt_number);
    expect(lines.some((l) => l.Ledger_Account === 'Customer Receivable Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 500)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Cash Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 1500)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Sales Account')).toBe(false); // the regression, once more
  });

  // Was Active-only — a Matured member had NO payout path anywhere in the
  // app (adjust-invoice always needs a real bill, even for a pure
  // refund). Extended to accept Matured too, with no early-exit
  // deduction (that penalty only makes sense for stopping in progress).
  test('a Matured member can be paid out too, with no deduction applied even if one is sent', async () => {
    const memberId = await makeMaturedMember('9911100015'); // ₹1000 available, already Matured
    const res = await request(app).post(`/api/savings/members/${memberId}/foreclose`).set(auth()).send({
      Settlement_Mode: 'Cash', Deduction_Amount: 300, Bonus_Amount: 50, Reason: 'Scheme matured — paid out',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.available_balance).toBe(1000);
    expect(res.body.data.deduction).toBe(0); // ignored — this member is Matured, not foreclosing early
    expect(res.body.data.net_payout).toBe(1050); // 1000 - 0 + 50

    const member = await db('tbl_scheme_members').where({ Member_ID: memberId }).first();
    expect(member.Status).toBe('Closed');

    const lines = await waitForJournalLines(res.body.data.receipt_number);
    expect(lines.some((l) => l.Ledger_Account === 'Scheme Foreclosure Income Account')).toBe(false); // no deduction income posted
    expect(lines.some((l) => l.Ledger_Account === 'Scheme Bonus Expense Account' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 50)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Cash Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 1050)).toBe(true);
  });

  test('a Closed member cannot be paid out again (neither Active nor Matured)', async () => {
    const memberId = await makeMaturedMember('9911100016');
    await request(app).post(`/api/savings/members/${memberId}/foreclose`).set(auth()).send({ Settlement_Mode: 'Cash' });
    const res = await request(app).post(`/api/savings/members/${memberId}/foreclose`).set(auth()).send({ Settlement_Mode: 'Cash' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not Active/);
  });
});
