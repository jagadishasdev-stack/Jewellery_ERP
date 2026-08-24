/**
 * Savings Scheme collections now post to the REAL ledger, not just the
 * disconnected tbl_scheme_accounting_entries shadow table (see
 * savingsScheme.js's /collect handler and reports.js's own balance-sheet
 * comment on this exact gap). A real sale/purchase through the live
 * routes creates the scheme + group + member fixtures needed, then a
 * Cash collection, a Cheque collection that matures the scheme (2-
 * installment group with a bonus), and the resulting Trial Balance are
 * all checked against what should have actually posted.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, schemeId, groupId, memberId;

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  const scheme = await request(app).post('/api/savings/schemes').set('Authorization', `Bearer ${token}`).send({
    Scheme_Code: 'QA-LEDGER-11', Scheme_Name: 'QA Ledger Test Scheme', Duration_Months: 11, Default_Monthly_Amount: 1000,
  });
  schemeId = scheme.body.data.Scheme_ID;

  const group = await request(app).post('/api/savings/groups').set('Authorization', `Bearer ${token}`).send({
    Scheme_ID: schemeId, Group_Code: 'QA-LEDGER-GRP', Group_Name: 'QA Ledger Test Group',
    Start_Date: '2026-01-01', Monthly_Amount: 1000, Total_Installments: 2, Bonus_Amount: 100,
  });
  groupId = group.body.data.Group_ID;

  const member = await request(app).post('/api/savings/members').set('Authorization', `Bearer ${token}`).send({
    Member_Name: 'QA Ledger Test Member', Mobile: '9999900022', Scheme_ID: schemeId, Group_ID: groupId,
    Joining_Date: '2026-01-01', Installment_Amount: 1000,
  });
  memberId = member.body.data.Member_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

async function waitForJournalCount(tenantId, expectedCount, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const [{ count }] = await db('tbl_accounting_journal').where({ Tenant_ID: tenantId }).count('Journal_ID as count');
    if (parseInt(count) >= expectedCount) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for ${expectedCount} journal(s) for ${tenantId}.`);
}

test('a Cash collection Dr Cash Account / Cr Customer Scheme Deposit Account in the real ledger', async () => {
  const res = await request(app).post('/api/savings/collect').set('Authorization', `Bearer ${token}`).send({
    Member_ID: memberId, Amount: 1000, Payment_Mode: 'Cash',
  });
  expect(res.status).toBe(201);
  expect(res.body.data.accounting.debit).toBe('Cash Account');
  expect(res.body.data.accounting.credit).toBe('Customer Scheme Deposit Account');
  await waitForJournalCount(tenant.tenantId, 1);

  const tb = await request(app).get('/api/accounting/trial-balance').set('Authorization', `Bearer ${token}`);
  expect(tb.body.data.isBalanced).toBe(true);
  expect(tb.body.data.rows.find((r) => r.Account_Name === 'Cash Account').Dr_Balance).toBe(1000);
  expect(tb.body.data.rows.find((r) => r.Account_Name === 'Customer Scheme Deposit Account').Cr_Balance).toBe(1000);

  // The old shadow-table insert still happens too — kept for the module's own audit trail.
  const shadowRow = await db('tbl_scheme_accounting_entries').where({ Tenant_ID: tenant.tenantId, Receipt_No: res.body.data.receipt_number }).first();
  expect(shadowRow).toBeDefined();
  expect(shadowRow.Debit_Account).toBe('Cash Account');
});

test('a Cheque collection uses "Cheque In Hand Account", not a generic bucket', async () => {
  const res = await request(app).post('/api/savings/collect').set('Authorization', `Bearer ${token}`).send({
    Member_ID: memberId, Amount: 1000, Payment_Mode: 'Cheque',
  });
  expect(res.status).toBe(201);
  expect(res.body.data.accounting.debit).toBe('Cheque In Hand Account');
  expect(res.body.data.is_complete).toBe(true); // 2nd of 2 installments — matures the scheme
  await waitForJournalCount(tenant.tenantId, 2);

  const tb = await request(app).get('/api/accounting/trial-balance').set('Authorization', `Bearer ${token}`);
  expect(tb.body.data.isBalanced).toBe(true);
  expect(tb.body.data.rows.find((r) => r.Account_Name === 'Cheque In Hand Account').Dr_Balance).toBe(1000);
  expect(tb.body.data.rows.find((r) => r.Account_Name === 'Customer Scheme Deposit Account').Cr_Balance).toBe(2000);
});

test('maturity triggers a real bonus provision journal, not just the shadow row', async () => {
  await waitForJournalCount(tenant.tenantId, 3); // collection #1, collection #2, the bonus journal

  const tb = await request(app).get('/api/accounting/trial-balance').set('Authorization', `Bearer ${token}`);
  expect(tb.body.data.isBalanced).toBe(true);
  expect(tb.body.data.rows.find((r) => r.Account_Name === 'Scheme Bonus Expense Account').Dr_Balance).toBe(100);
  expect(tb.body.data.rows.find((r) => r.Account_Name === 'Scheme Bonus Provision Account').Cr_Balance).toBe(100);

  const bonusJournal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Source_Type: 'JOURNAL' }).whereLike('Narration', '%maturity bonus%').first();
  expect(bonusJournal).toBeDefined();
});

test('the collections also show up in the Day Book and the Accounting Dashboard\'s cash balance', async () => {
  const dayBook = await request(app).get('/api/accounting/day-book').set('Authorization', `Bearer ${token}`);
  expect(dayBook.body.data.vouchers.some((v) => v.Narration?.includes('Scheme collection'))).toBe(true);

  const dashboard = await request(app).get('/api/accounting/dashboard').set('Authorization', `Bearer ${token}`);
  expect(dashboard.body.data.cashBalance).toBe(1000); // only the Cash collection touches cash; the Cheque one sits in Cheque In Hand until cleared
});

describe('Digi Gold schemes post to their own ledger, and it counts in the Balance Sheet', () => {
  // Found while seeding real Savings Club demo data: a Digi Gold scheme's
  // collections correctly posted to 'Digi Gold Liability Account' instead
  // of 'Customer Scheme Deposit Account' (savingsScheme.js's isDigiGold
  // check), but reports.js's balance sheet only ever summed the latter
  // two scheme ledgers — Digi Gold's real liability was invisible in
  // scheme_liabilities for any tenant actually running one.
  let digiSchemeId, digiGroupId, digiMemberId;

  test('setup: a Digi Gold scheme/group/member', async () => {
    const scheme = await request(app).post('/api/savings/schemes').set('Authorization', `Bearer ${token}`).send({
      Scheme_Code: 'QA-DIGIGOLD', Scheme_Name: 'QA Digi Gold Flexi', Duration_Months: 6, Default_Monthly_Amount: 1000,
    });
    digiSchemeId = scheme.body.data.Scheme_ID;
    const group = await request(app).post('/api/savings/groups').set('Authorization', `Bearer ${token}`).send({
      Scheme_ID: digiSchemeId, Group_Code: 'QA-DIGIGOLD-GRP', Group_Name: 'QA Digi Gold Group',
      Start_Date: '2026-01-01', Monthly_Amount: 1000, Total_Installments: 6,
    });
    digiGroupId = group.body.data.Group_ID;
    const member = await request(app).post('/api/savings/members').set('Authorization', `Bearer ${token}`).send({
      Member_Name: 'QA Digi Gold Member', Mobile: '9999900033', Scheme_ID: digiSchemeId, Group_ID: digiGroupId,
      Joining_Date: '2026-01-01', Installment_Amount: 1000,
    });
    digiMemberId = member.body.data.Member_ID;
  });

  test('a Digi Gold collection posts Dr Cash / Cr Digi Gold Liability Account, not Customer Scheme Deposit', async () => {
    const res = await request(app).post('/api/savings/collect').set('Authorization', `Bearer ${token}`).send({
      Member_ID: digiMemberId, Amount: 1000, Payment_Mode: 'Cash',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.accounting.credit).toBe('Digi Gold Liability Account');

    // The ledger post is fire-and-forget (same convention as every other
    // money-moving route in this codebase) — poll rather than assume it's
    // already landed by the time the response comes back.
    let digiRow;
    const start = Date.now();
    while (Date.now() - start < 3000 && !digiRow) {
      const tb = await request(app).get('/api/accounting/trial-balance').set('Authorization', `Bearer ${token}`);
      digiRow = tb.body.data.rows.find((r) => r.Account_Name === 'Digi Gold Liability Account');
      if (!digiRow) await new Promise((r) => setTimeout(r, 50));
    }
    expect(digiRow?.Cr_Balance).toBe(1000);
  });

  test('the Balance Sheet\'s scheme_liabilities includes the Digi Gold balance', async () => {
    const financial = await request(app).get('/api/reports/financial').set('Authorization', `Bearer ${token}`).query({ fromDate: '2026-01-01', toDate: '2027-12-31' });
    expect(financial.status).toBe(200);
    // 2000 (QA-LEDGER-11 deposit) + 100 (its bonus provision) + 1000 (Digi Gold) = 3100
    expect(financial.body.data.balanceSheet.scheme_liabilities).toBe(3100);
  });
});
