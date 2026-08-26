/**
 * Real modules where actual cash/bank money changed hands but NONE of it
 * ever reached the double-entry ledger — found by systematically auditing
 * every route that handles Payment_Mode/Amount_Paid/Current_Balance for
 * whether it imports the accounting engine at all:
 *
 *   - Karigar wage settlement (karigar.js `/settle`) only moved the
 *     karigar's own running balance.
 *   - Pawnbroking (pawnbroking.js) — loan disbursement, every collection
 *     type (interest/part-payment/redemption/top-up), and auction all
 *     posted nothing.
 *   - Repair delivery (repair.js `/deliver`) was the worst of the three —
 *     it didn't even record Payment_Mode/Final_Cost anywhere, silently
 *     discarding both and just zeroing Balance_Due unconditionally.
 *   - HR Payroll (hr.js `/finalize`) — one of the largest recurring
 *     expenses a real business has, and it never touched Trial Balance,
 *     Cash Book, or P&L at all; each payroll detail row's own
 *     Payment_Status/Payment_Date/Payment_Mode columns (already in the
 *     schema) were never set either.
 *
 * All four now post through postJournal() like everything else. Each
 * test checks the actual Dr/Cr lines by the journal's own Reference.
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

test('karigar settlement posts Dr Making Charges Paid to Karigar / Cr Cash', async () => {
  // /settle no longer takes an arbitrary client-supplied amount — it only
  // pays for real, reconciled (Completed), unsettled issues in the given
  // date range, recomputing the amount itself (see karigarWastageSettlement.test.js
  // for the full wastage-math/idempotency coverage). Build one real
  // issue+return here so this test can still confirm the actual Dr/Cr
  // ledger lines a real settlement posts.
  const vendor = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'Ledger Test Karigar', Vendor_Type: 'Karigar', Mobile_1: '9911100001',
  });
  const karigarId = vendor.body.data.Vendor_ID;
  const issue = await request(app).post('/api/karigar/issue').set(auth()).send({
    Karigar_ID: karigarId, Gold_Weight_Issued: 10, Gold_Rate_At_Issue: 6000, Karigar_Wages_Rate: 500, Issue_Date: '2026-08-24',
  });
  await request(app).post('/api/karigar/return').set(auth()).send({
    Issue_ID: issue.body.data.Issue_ID, Gross_Weight_Returned: 10, Net_Gold_Weight: 10, Wastage_Weight: 0, Return_Date: '2026-08-24',
  });
  // 10g returned * 500 wages rate = 5000, no wastage deduction.

  const res = await request(app).post('/api/karigar/settle').set(auth()).send({
    karigarId, fromDate: '2026-08-24', toDate: '2026-08-24', paymentMode: 'Cash',
  });
  expect(res.status).toBe(200);
  expect(res.body.data.amount).toBe(5000);

  const vendorRow = await db('tbl_vendor_master').where({ Vendor_ID: karigarId }).first();
  expect(parseFloat(vendorRow.Current_Balance)).toBe(-5000); // unchanged existing behavior

  // Reference is "KARIGAR-SETTLE-<id>-<timestamp>" — find it by prefix.
  let journal;
  const start = Date.now();
  while (Date.now() - start < 3000 && !journal) {
    journal = await db('tbl_accounting_journal').where('Reference', 'like', `KARIGAR-SETTLE-${karigarId}-%`).first();
    if (!journal) await new Promise((r) => setTimeout(r, 50));
  }
  const lines = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });
  expect(lines.some((l) => l.Ledger_Account === 'Making Charges Paid to Karigar Account' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 5000)).toBe(true);
  expect(lines.some((l) => l.Ledger_Account === 'Cash Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 5000)).toBe(true);
});

describe('Pawnbroking — disbursement, collections, and auction all post real, balanced journals', () => {
  let loanId, loanNumber, customerId;

  beforeAll(async () => {
    const cust = await request(app).post('/api/customers').set(auth()).send({ Customer_Name: 'Pawn Ledger Test', Mobile_1: '9911100002' });
    customerId = cust.body.data.Customer_ID;
  });

  test('loan disbursement posts Dr Pawn Loan Receivable / Cr Cash', async () => {
    const res = await request(app).post('/api/pawnbroking/loans').set(auth()).send({
      Customer_ID: customerId, Loan_Date: '2026-08-01', Loan_Amount: 40000, Interest_Rate_Pct: 2,
      items: [{ Item_Description: 'Gold ring', Gross_Weight: 8, Net_Weight: 7.5, Estimated_Value: 44000 }],
    });
    expect(res.status).toBe(201);
    loanId = res.body.data.Loan_ID;
    loanNumber = res.body.data.Loan_Number;

    const lines = await waitForJournalLines(loanNumber);
    expect(lines.some((l) => l.Ledger_Account === 'Pawn Loan Receivable Account' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 40000)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Cash Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 40000)).toBe(true);
  });

  test('an interest-only receipt posts Dr Cash / Cr Pawn Interest Income, not touching the receivable', async () => {
    const res = await request(app).post(`/api/pawnbroking/loans/${loanId}/transactions`).set(auth()).send({
      Txn_Type: 'Interest Receipt', Total_Amount: 800, Interest_Collected: 800, Payment_Mode: 'Cash',
    });
    expect(res.status).toBe(201);
    const lines = await waitForJournalLines(res.body.data.transaction.Receipt_Number);
    expect(lines.some((l) => l.Ledger_Account === 'Cash Account' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 800)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Pawn Interest Income Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 800)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Pawn Loan Receivable Account')).toBe(false);
  });

  test('a full redemption clears the receivable and marks the loan Redeemed', async () => {
    const res = await request(app).post(`/api/pawnbroking/loans/${loanId}/transactions`).set(auth()).send({
      Txn_Type: 'Redemption', Total_Amount: 40200, Interest_Collected: 200, Principal_Collected: 40000, Payment_Mode: 'Cash',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.loan.Status).toBe('Redeemed');

    const lines = await waitForJournalLines(res.body.data.transaction.Receipt_Number);
    expect(lines.some((l) => l.Ledger_Account === 'Cash Account' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 40200)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Pawn Loan Receivable Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 40000)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Pawn Interest Income Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 200)).toBe(true);

    // The Pawn Loan Receivable Account should now net to exactly zero for
    // this tenant (disbursed 40000, redeemed 40000 back).
    const receivable = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenant.tenantId, Account_Name: 'Pawn Loan Receivable Account' }).first();
    const entries = await db('tbl_accounting_entries').where({ Account_ID: receivable.Account_ID });
    const net = entries.reduce((s, e) => s + (e.Entry_Type === 'Dr' ? 1 : -1) * parseFloat(e.Amount), 0);
    expect(Math.round(net * 100) / 100).toBe(0);
  });

  test('auctioning a loan with a shortfall posts a real write-off and clears the receivable', async () => {
    const loanRes = await request(app).post('/api/pawnbroking/loans').set(auth()).send({
      Customer_ID: customerId, Loan_Date: '2026-08-01', Loan_Amount: 20000, Interest_Rate_Pct: 2,
      items: [{ Item_Description: 'Silver anklet', Gross_Weight: 30, Net_Weight: 28, Estimated_Value: 21000 }],
    });
    const auctionLoanId = loanRes.body.data.Loan_ID;
    await waitForJournalLines(loanRes.body.data.Loan_Number); // wait for disbursement first

    const res = await request(app).post(`/api/pawnbroking/loans/${auctionLoanId}/auction`).set(auth()).send({ Auction_Sale_Value: 15000 });
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.data.Principal_Outstanding)).toBe(0);

    const lines = await waitForJournalLines(`${loanRes.body.data.Loan_Number}-AUCTION`);
    expect(lines.some((l) => l.Ledger_Account === 'Cash Account' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 15000)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Pawn Loan Receivable Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 20000)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Pawn Auction Shortfall Expense Account' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 5000)).toBe(true);
    const totalDr = lines.filter((l) => l.Entry_Type === 'Dr').reduce((s, l) => s + parseFloat(l.Amount), 0);
    const totalCr = lines.filter((l) => l.Entry_Type === 'Cr').reduce((s, l) => s + parseFloat(l.Amount), 0);
    expect(totalDr).toBe(totalCr);
  });
});

describe('Repair — advance at intake and final payment at delivery both actually get recorded', () => {
  test('an advance collected at intake posts Dr Cash / Cr Repair Income', async () => {
    const res = await request(app).post('/api/repair').set(auth()).send({
      Item_Description: 'Chain repair', Estimate_Amount: 1000, Advance_Paid: 300, Payment_Mode: 'Cash', Total_Charge: 1000, Balance_Due: 700,
    });
    expect(res.status).toBe(201);
    const lines = await waitForJournalLines(res.body.data.Job_Card_Number);
    expect(lines.some((l) => l.Ledger_Account === 'Cash Account' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 300)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Repair Income Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 300)).toBe(true);
  });

  test('delivery actually records and posts the final payment — it used to silently discard it entirely', async () => {
    const created = await request(app).post('/api/repair').set(auth()).send({
      Item_Description: 'Ring resizing', Estimate_Amount: 500, Total_Charge: 500, Balance_Due: 500,
    });
    const repairId = created.body.data.Repair_ID;

    const res = await request(app).post(`/api/repair/${repairId}/deliver`).set(auth()).send({ Final_Cost: 500, Payment_Mode: 'Cash' });
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.data.Balance_Due)).toBe(0);
    expect(parseFloat(res.body.data.Advance_Paid)).toBe(500); // was 0, now holds the full amount actually collected

    const order = await db('tbl_repair_orders').where({ Repair_ID: repairId }).first();
    const lines = await waitForJournalLines(order.Job_Card_Number);
    expect(lines.some((l) => l.Ledger_Account === 'Cash Account' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 500)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Repair Income Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 500)).toBe(true);
  });
});

describe('Purchase — a payment against a specific bank account lands in that bank\'s own ledger', () => {
  test('paying a supplier via a chosen bank account posts Cr against that bank, not the generic Unassigned ledger', async () => {
    const bank = await request(app).post('/api/bank-cheque/accounts').set(auth()).send({
      Bank_Name: 'HDFC', Account_Number: 'PURCHASETEST0001',
    });
    expect(bank.status).toBe(201);
    const bankAccountId = bank.body.data.Account_ID;
    const bankLedgerName = `HDFC (PURCHASETEST0001)`;

    const supplier = await request(app).post('/api/karigar/vendor').set(auth()).send({
      Vendor_Name: 'Purchase Ledger Test Supplier', Vendor_Type: 'Supplier', Mobile_1: '9911100003',
    });
    expect(supplier.status).toBe(201);
    const supplierId = supplier.body.data.Vendor_ID;

    const res = await request(app).post('/api/purchase/create').set(auth()).send({
      Supplier_ID: supplierId, Total_Amount: 10000, Subtotal_Amount: 10000, GST_Amount: 0,
      Amount_Paid: 10000, Payment_Mode: 'Bank Transfer', Bank_Account_ID: bankAccountId,
      items: [{ Item_Description: 'Gold bar', Gross_Weight: 10, Purchase_Rate: 10000 }],
    });
    expect(res.status).toBe(201);

    // Purchase posts TWO journals under the same Reference — the accrual
    // (Dr Gold Stock / Cr Supplier Payable) followed by a separate, also
    // fire-and-forget payment journal. waitForJournalLines' plain
    // .first() can win the race against whichever one lands first, so
    // poll until both have actually landed (4 lines total) before asserting.
    let lines = [];
    const start = Date.now();
    while (Date.now() - start < 3000 && lines.length < 4) {
      const journals = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: res.body.data.Purchase_Number });
      if (journals.length) lines = await db('tbl_accounting_entries').whereIn('Journal_ID', journals.map((j) => j.Journal_ID));
      if (lines.length < 4) await new Promise((r) => setTimeout(r, 50));
    }
    expect(lines.some((l) => l.Ledger_Account === bankLedgerName && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 10000)).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Bank Account (Unassigned — pre-dates per-bank ledgers)')).toBe(false);

    // Cr against the bank means money paid OUT to the supplier — starting
    // from a fresh 0-balance account, that correctly goes negative.
    const bankRow = await db('tbl_bank_account_master').where({ Account_ID: bankAccountId }).first();
    expect(parseFloat(bankRow.Current_Balance)).toBe(-10000);
  });
});

describe('HR Payroll — finalizing a run actually pays it and posts a real, balanced journal', () => {
  let staffId, runId;

  beforeAll(async () => {
    const staff = await request(app).post('/api/tenant/users').set(auth()).send({
      Username: `payroll_ledger_test_${Date.now()}`, Password: 'StaffDemo@2026', Full_Name: 'Payroll Ledger Test Staff', Role_ID: 12,
    });
    staffId = staff.body.data.User_ID;
    await request(app).post('/api/hr/salary-structure').set(auth()).send({
      User_ID: staffId, Basic: 20000, HRA: 5000, Conveyance: 1000, Other_Allowance: 500, PF_Pct: 12, ESI_Pct: 1, Effective_From: '2026-01-01',
    });
    for (const d of ['01', '02', '03', '04', '05']) {
      await request(app).post('/api/hr/attendance').set(auth()).send({ records: [{ User_ID: staffId, Attendance_Date: `2026-08-${d}`, Status: 'Present' }] });
    }
    const run = await request(app).post('/api/hr/payroll/runs').set(auth()).send({ Pay_Month: 8, Pay_Year: 2026 }); // matches the attendance dates marked above
    runId = run.body.data.Run_ID;
  });

  test('finalizing posts Dr Salary Account, Cr PF/ESI Payable, Cr Cash — balanced, matching the computed Net_Salary', async () => {
    const detail = await db('tbl_payroll_details').where({ Run_ID: runId }).first();
    expect(parseInt(detail.Days_Present)).toBe(5); // confirms the attendance dates actually landed in this run's window
    const res = await request(app).post(`/api/hr/payroll/runs/${runId}/finalize`).set(auth()).send({ Payment_Mode: 'Cash' });
    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('Finalized');

    const updatedDetail = await db('tbl_payroll_details').where({ Run_ID: runId }).first();
    expect(updatedDetail.Payment_Status).toBe('Paid');
    expect(updatedDetail.Payment_Mode).toBe('Cash');

    const lines = await waitForJournalLines(`PAYROLL-8-2026`);
    expect(lines.some((l) => l.Ledger_Account === 'Salary Account' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === parseFloat(detail.Gross_Salary))).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'PF Payable Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === parseFloat(detail.PF_Deduction))).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'ESI Payable Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === parseFloat(detail.ESI_Deduction))).toBe(true);
    expect(lines.some((l) => l.Ledger_Account === 'Cash Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === parseFloat(detail.Net_Salary))).toBe(true);

    const totalDr = lines.filter((l) => l.Entry_Type === 'Dr').reduce((s, l) => s + parseFloat(l.Amount), 0);
    const totalCr = lines.filter((l) => l.Entry_Type === 'Cr').reduce((s, l) => s + parseFloat(l.Amount), 0);
    expect(totalDr).toBe(totalCr);
  });

  test('a run cannot be finalized twice', async () => {
    const res = await request(app).post(`/api/hr/payroll/runs/${runId}/finalize`).set(auth());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already finalized/);
  });
});
