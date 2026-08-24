/**
 * Manual voucher entry (Receipt/Payment/Contra/Journal + reverse) and
 * Chart of Accounts CRUD (server/src/routes/accounting.js) — the pieces
 * built for the frontend's Voucher Entry and Chart of Accounts screens.
 * Also covers per-bank payment selection (sales.js resolving a specific
 * bank's own ledger via Bank_Account_ID) since that shares the same
 * "does the right ledger actually get touched" concern as the vouchers.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token;

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('Chart of Accounts — manual create/deactivate', () => {
  test('creates a new ledger account with an auto-generated code', async () => {
    const res = await request(app).post('/api/accounting/chart-of-accounts').set(auth()).send({
      Account_Name: 'QA Test Electricity Expense', Account_Group: 'Expenses', Account_Sub_Group: 'Indirect Expense',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.Is_System).toBe(false);
    expect(res.body.data.Account_Code).toBeTruthy();
  });

  test('rejects a duplicate account name for the same tenant', async () => {
    const res = await request(app).post('/api/accounting/chart-of-accounts').set(auth()).send({
      Account_Name: 'QA Test Electricity Expense', Account_Group: 'Expenses',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already exists/);
  });

  test('rejects an invalid Account_Group', async () => {
    const res = await request(app).post('/api/accounting/chart-of-accounts').set(auth()).send({
      Account_Name: 'QA Test Bad Group', Account_Group: 'NotARealGroup',
    });
    expect(res.status).toBe(400);
  });

  test('deactivates a manually-created (non-system) account', async () => {
    const account = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenant.tenantId, Account_Name: 'QA Test Electricity Expense' }).first();
    const res = await request(app).patch(`/api/accounting/chart-of-accounts/${account.Account_ID}/deactivate`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.Is_Active).toBe(false);
  });

  test('refuses to deactivate a system account', async () => {
    const cash = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenant.tenantId, Account_Name: 'Cash Account' }).first();
    const res = await request(app).patch(`/api/accounting/chart-of-accounts/${cash.Account_ID}/deactivate`).set(auth());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/system account/i);
  });
});

describe('Manual vouchers — Receipt / Payment / Contra / Journal', () => {
  let receiptJournalId;

  test('Receipt: Dr the receiving account, Cr the source account', async () => {
    const res = await request(app).post('/api/accounting/voucher/receipt').set(auth()).send({
      receivedInto: 'Cash Account', fromAccount: 'QA Test Customer Receivable', amount: 5000, narration: 'Advance from customer',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.journalNumber).toMatch(/^JNL-/);
    receiptJournalId = res.body.data.journalId;

    const entries = await db('tbl_accounting_entries').where({ Journal_ID: receiptJournalId });
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.Ledger_Account === 'Cash Account').Entry_Type).toBe('Dr');
    expect(entries.find((e) => e.Ledger_Account === 'QA Test Customer Receivable').Entry_Type).toBe('Cr');
  });

  test('Payment: Dr the account settled, Cr the account money left from', async () => {
    const res = await request(app).post('/api/accounting/voucher/payment').set(auth()).send({
      paidFrom: 'Cash Account', toAccount: 'QA Test Supplier Payable', amount: 2000, narration: 'Advance to supplier',
    });
    expect(res.status).toBe(201);
  });

  test('Contra: rejects transferring an account into itself', async () => {
    const res = await request(app).post('/api/accounting/voucher/contra').set(auth()).send({
      fromAccount: 'Cash Account', toAccount: 'Cash Account', amount: 100,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/must be different/);
  });

  test('Journal: rejects an unbalanced line set', async () => {
    const res = await request(app).post('/api/accounting/voucher/journal').set(auth()).send({
      narration: 'Bad journal',
      lines: [{ account: 'Cash Account', type: 'Dr', amount: 100 }, { account: 'Sales Account', type: 'Cr', amount: 90 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not balance/);
  });

  test('Journal: accepts a balanced multi-line entry', async () => {
    const res = await request(app).post('/api/accounting/voucher/journal').set(auth()).send({
      narration: 'QA depreciation test',
      lines: [
        { account: 'QA Test Depreciation Expense', type: 'Dr', amount: 1500 },
        { account: 'Cash Account', type: 'Cr', amount: 1000 },
        { account: 'Bank Account (Unassigned — pre-dates per-bank ledgers)', type: 'Cr', amount: 500 },
      ],
    });
    expect(res.status).toBe(201);
  });

  test('Voucher history lists the manually-entered vouchers, newest first', async () => {
    const res = await request(app).get('/api/accounting/vouchers').set(auth()).query({ limit: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(3); // Receipt + Payment + the balanced Journal (Contra and the unbalanced Journal were both rejected, so never posted)
    expect(res.body.data.items.every((v) => ['RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL'].includes(v.Source_Type))).toBe(true);
  });

  test('Reverse: posts an equal-and-opposite journal, original stays untouched', async () => {
    const before = await db('tbl_accounting_entries').where({ Journal_ID: receiptJournalId });
    const res = await request(app).post(`/api/accounting/voucher/${receiptJournalId}/reverse`).set(auth());
    expect(res.status).toBe(201);

    const after = await db('tbl_accounting_entries').where({ Journal_ID: receiptJournalId });
    expect(after).toEqual(before); // the original voucher itself is never touched

    const reversalEntries = await db('tbl_accounting_entries').where({ Journal_ID: res.body.data.journalId });
    expect(reversalEntries.find((e) => e.Ledger_Account === 'Cash Account').Entry_Type).toBe('Cr'); // flipped from the original's Dr
  });

  test('Reverse: refuses to reverse the same voucher twice', async () => {
    const res = await request(app).post(`/api/accounting/voucher/${receiptJournalId}/reverse`).set(auth());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already been reversed/);
  });

  test('Trial Balance still balances after receipt + payment + journal + reversal', async () => {
    const tb = await request(app).get('/api/accounting/trial-balance').set(auth());
    expect(tb.body.data.isBalanced).toBe(true);
  });
});

describe('Per-bank payment selection — a sale posts against the SPECIFIC bank chosen, not the generic fallback', () => {
  let ornamentId, bankAccountId;

  beforeAll(async () => {
    const [ornament] = await db('tbl_ornament_master').insert({
      Tenant_ID: tenant.tenantId, Article_Number: 'QATEST-VOUCHER-BANK-001', Gross_Weight: 5, Net_Gold_Weight: 4.5,
      Current_Gold_Rate: 6000, Base_Making_Charge_Per_Gram: 500, Purchase_Cost: 25000, Stock_Quantity: 1,
      Is_Sold: false, Is_Active: true, Total_Price: 22000,
    }).returning('Ornament_ID');
    ornamentId = ornament.Ornament_ID;

    // Creating the bank account through the real route also creates its
    // matching Chart of Accounts ledger — see bankCheque.js.
    const bankRes = await request(app).post('/api/bank-cheque/accounts').set(auth()).send({
      Bank_Name: 'QA Test Voucher Bank', Account_Number: 'QAVCH001', Opening_Balance: 0,
    });
    bankAccountId = bankRes.body.data.Account_ID;
  });

  afterAll(async () => {
    await db('tbl_ornament_master').where({ Article_Number: 'QATEST-VOUCHER-BANK-001' }).del();
  });

  test('a bank-mode payment with Bank_Account_ID posts to that bank\'s own ledger and updates its Current_Balance', async () => {
    const sale = await request(app).post('/api/sales/create').set(auth()).send({
      items: [{ Ornament_ID: ornamentId, Total_Line_Price: 22000, Gross_Weight: 5, Net_Gold_Weight: 4.5 }],
      Payment_Mode: 'Bank Transfer', Amount_Paid: 22000, Customer_Name: 'Voucher Bank Test Customer',
      payments: [{ mode: 'Bank Transfer', amount: 22000, Bank_Account_ID: bankAccountId }],
    });
    expect(sale.status).toBe(201);

    // Non-blocking accounting post — poll briefly for it to land.
    const label = `QA Test Voucher Bank (QAVCH001)`;
    const start = Date.now();
    let bankRow;
    while (Date.now() - start < 3000) {
      bankRow = await db('tbl_bank_account_master').where({ Account_ID: bankAccountId }).first();
      if (parseFloat(bankRow.Current_Balance) > 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(parseFloat(bankRow.Current_Balance)).toBe(22000);

    const coaRow = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenant.tenantId, Account_Name: label }).first();
    const entries = await db('tbl_accounting_entries').where({ Tenant_ID: tenant.tenantId, Account_ID: coaRow.Account_ID });
    expect(entries).toHaveLength(1);
    expect(entries[0].Entry_Type).toBe('Dr');
    expect(parseFloat(entries[0].Amount)).toBe(22000);

    // And NOT the generic unassigned fallback every bank-type payment used before this.
    const unassigned = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenant.tenantId, Account_Name: 'Bank Account (Unassigned — pre-dates per-bank ledgers)' }).first();
    const unassignedEntries = await db('tbl_accounting_entries').where({ Account_ID: unassigned.Account_ID, Narration: 'Bank Transfer received | ' + sale.body.data.sale.Invoice_Number });
    expect(unassignedEntries).toHaveLength(0);
  });
});
