/**
 * Regression coverage for a real bug found by seeding a demo tenant and
 * checking every screen: creating a bank account (or a manual Chart of
 * Accounts ledger) with a non-zero opening balance used to just write a
 * static Opening_Balance/Opening_Balance_Type field that Trial Balance and
 * Ledger both silently added in, with NOTHING ever posted to the
 * offsetting side — a real, confirmed production tenant (DLJ) had exactly
 * this problem (a bank's ₹100,000 opening balance with zero matching
 * journal entries, permanently unbalancing that tenant's books).
 *
 * Also covers a second, related gap: clearing a Received cheque only ever
 * incremented tbl_bank_account_master.Current_Balance directly — the
 * cheque's money (sitting in "Cheque In Hand Account" since it was
 * originally logged) never actually moved in the real ledger either.
 *
 * Both are now fixed by posting a real, balanced postJournal() entry
 * instead of (bank account / manual ledger opening balance) or in
 * addition to (cheque clearing) the old side-channel update — and the
 * fix for both had to be careful NOT to also increment Current_Balance a
 * second time, since postJournal()'s own bank-balance sync already does
 * that (a mistake caught while fixing DLJ's real data by hand, before it
 * ever reached this test).
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

test('a bank account created with a non-zero opening balance posts a real balanced journal, and Current_Balance lands correctly (not doubled)', async () => {
  const res = await request(app).post('/api/bank-cheque/accounts').set(auth()).send({
    Bank_Name: 'Regression Test Bank', Account_Number: 'REGR001', Opening_Balance: 50000,
  });
  expect(res.status).toBe(201);

  const lines = await waitForJournalLines(`OPENING-${res.body.data.Account_ID}`);
  expect(lines.some((l) => l.Ledger_Account === 'Regression Test Bank (REGR001)' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 50000)).toBe(true);
  expect(lines.some((l) => l.Ledger_Account === 'Owner Capital Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 50000)).toBe(true);

  const bank = await db('tbl_bank_account_master').where({ Account_ID: res.body.data.Account_ID }).first();
  expect(parseFloat(bank.Current_Balance)).toBe(50000); // NOT 100000 — the historical double-count bug this guards against

  const coaRow = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenant.tenantId, Account_Name: 'Regression Test Bank (REGR001)' }).first();
  expect(parseFloat(coaRow.Opening_Balance)).toBe(0); // real journal is the source of truth now, not a static field

  const tb = await request(app).get('/api/accounting/trial-balance').set(auth());
  expect(tb.body.data.isBalanced).toBe(true);
});

test('a manually-created ledger account with a non-zero opening balance also posts a real balanced journal', async () => {
  const res = await request(app).post('/api/accounting/chart-of-accounts').set(auth()).send({
    Account_Name: 'Regression Test Expense Ledger', Account_Group: 'Expenses', Opening_Balance: 1200, Opening_Balance_Type: 'Dr',
  });
  expect(res.status).toBe(201);
  expect(parseFloat(res.body.data.Opening_Balance)).toBe(0); // not stored statically

  const lines = await waitForJournalLines(`OPENING-${res.body.data.Account_ID}`);
  expect(lines.some((l) => l.Ledger_Account === 'Regression Test Expense Ledger' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 1200)).toBe(true);
  expect(lines.some((l) => l.Ledger_Account === 'Owner Capital Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 1200)).toBe(true);

  const tb = await request(app).get('/api/accounting/trial-balance').set(auth());
  expect(tb.body.data.isBalanced).toBe(true);
});

test('clearing a Received cheque posts Dr the specific bank / Cr Cheque In Hand Account, and Current_Balance is not double-counted', async () => {
  const bankRes = await request(app).post('/api/bank-cheque/accounts').set(auth()).send({
    Bank_Name: 'Cheque Clear Test Bank', Account_Number: 'CHQCLR001', Opening_Balance: 0,
  });
  const chequeRes = await request(app).post('/api/bank-cheque/cheques').set(auth()).send({
    Cheque_Type: 'Received', Party_Name: 'Test Customer', Cheque_Number: 'CHQ-REGR-001', Amount: 7500,
    Cheque_Date: '2026-08-12', Account_ID: bankRes.body.data.Account_ID,
  });
  expect(chequeRes.status).toBe(201);

  const clearRes = await request(app).post(`/api/bank-cheque/cheques/${chequeRes.body.data.Cheque_ID}/clear`).set(auth());
  expect(clearRes.status).toBe(200);

  const lines = await waitForJournalLines(`CHQCLR-${chequeRes.body.data.Cheque_ID}`);
  expect(lines.some((l) => l.Ledger_Account === 'Cheque Clear Test Bank (CHQCLR001)' && l.Entry_Type === 'Dr' && parseFloat(l.Amount) === 7500)).toBe(true);
  expect(lines.some((l) => l.Ledger_Account === 'Cheque In Hand Account' && l.Entry_Type === 'Cr' && parseFloat(l.Amount) === 7500)).toBe(true);

  const bank = await db('tbl_bank_account_master').where({ Account_ID: bankRes.body.data.Account_ID }).first();
  expect(parseFloat(bank.Current_Balance)).toBe(7500); // opened at 0, one 7500 cheque cleared — NOT 15000

  const tb = await request(app).get('/api/accounting/trial-balance').set(auth());
  expect(tb.body.data.isBalanced).toBe(true);
});
