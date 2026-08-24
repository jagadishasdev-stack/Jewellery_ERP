/**
 * The shared double-entry posting engine (utils/accountingEngine.js) —
 * the actual "accounting engine" behind Sales, Purchase, and everything
 * that posts through it. These test the engine directly (not via HTTP)
 * since it's a plain function, not a route.
 */
const { postJournal, getOrCreateAccount } = require('../src/utils/accountingEngine');
const { runWithTenantDb } = require('../src/db/tenantDb');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant;

// postJournal (and getOrCreateAccount) read through the tenantDb
// AsyncLocalStorage proxy — normally established by authenticate()
// middleware on every real request. Calling the engine directly here
// (not via HTTP) needs that same context set up by hand; QATEST has no
// dedicated tenant database, so the plain control-plane connection is the
// right one to run it against, same as getTenantDb()'s own fallback.
const withTenantContext = (fn) => runWithTenantDb(db, fn);

beforeAll(async () => { tenant = await testTenant.setup(); });
afterAll(async () => { await testTenant.teardown(); await db.destroy(); });

test('rejects a journal where Dr does not equal Cr', async () => {
  await expect(withTenantContext(() => postJournal({
    tenantId: tenant.tenantId, sourceType: 'JOURNAL', reference: 'TEST-1',
    lines: [
      { account: 'Cash Account', group: 'Assets', sub: 'Cash', type: 'Dr', amount: 1000 },
      { account: 'Sales Account', group: 'Income', sub: 'Direct Income', type: 'Cr', amount: 900 },
    ],
  }))).rejects.toThrow(/does not balance/);

  const journals = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: 'TEST-1' });
  expect(journals).toHaveLength(0); // nothing was written — not a partial/broken post
});

test('posts a balanced journal with real Chart of Accounts rows behind every line', async () => {
  const { journalId, journalNumber } = await withTenantContext(() => postJournal({
    tenantId: tenant.tenantId, sourceType: 'JOURNAL', reference: 'TEST-2', narration: 'Balanced test entry',
    lines: [
      { account: 'Cash Account', group: 'Assets', sub: 'Cash', type: 'Dr', amount: 5000 },
      { account: 'Sales Account', group: 'Income', sub: 'Direct Income', type: 'Cr', amount: 5000 },
    ],
  }));
  expect(journalNumber).toMatch(/^JNL-/);

  const entries = await db('tbl_accounting_entries').where({ Journal_ID: journalId });
  expect(entries).toHaveLength(2);
  for (const e of entries) expect(e.Account_ID).not.toBeNull(); // real account, not a bare string
});

test('a bank-linked account keeps tbl_bank_account_master.Current_Balance in sync automatically', async () => {
  const [bank] = await db('tbl_bank_account_master').insert({
    Tenant_ID: tenant.tenantId, Bank_Name: 'Test Bank', Account_Number: '000111222', Opening_Balance: 10000, Current_Balance: 10000,
  }).returning('*');
  const [coaRow] = await db('tbl_chart_of_accounts').insert({
    Tenant_ID: tenant.tenantId, Account_Code: '1090', Account_Name: 'Test Bank (000111222)',
    Account_Group: 'Assets', Account_Sub_Group: 'Bank', Is_Bank_Account: true, Bank_Account_ID: bank.Account_ID,
  }).returning('*');

  await withTenantContext(() => postJournal({
    tenantId: tenant.tenantId, sourceType: 'RECEIPT', reference: 'TEST-3',
    lines: [
      { account: coaRow.Account_Name, type: 'Dr', amount: 2500 },
      { account: 'Sales Account', group: 'Income', sub: 'Direct Income', type: 'Cr', amount: 2500 },
    ],
  }));

  const updatedBank = await db('tbl_bank_account_master').where({ Account_ID: bank.Account_ID }).first();
  expect(parseFloat(updatedBank.Current_Balance)).toBe(12500); // 10000 opening + 2500 Dr received

  await db('tbl_bank_account_master').where({ Account_ID: bank.Account_ID }).del();
});

test('auto-queues a Tally sync-log row only when Tally sync is enabled for the tenant', async () => {
  await db('tbl_tally_sync_log').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_tally_config').where({ Tenant_ID: tenant.tenantId }).del();

  await withTenantContext(() => postJournal({
    tenantId: tenant.tenantId, sourceType: 'JOURNAL', reference: 'TEST-NO-TALLY',
    lines: [
      { account: 'Cash Account', group: 'Assets', sub: 'Cash', type: 'Dr', amount: 100 },
      { account: 'Sales Account', group: 'Income', sub: 'Direct Income', type: 'Cr', amount: 100 },
    ],
  }));
  expect(await db('tbl_tally_sync_log').where({ Tenant_ID: tenant.tenantId })).toHaveLength(0);

  await db('tbl_tally_config').insert({ Tenant_ID: tenant.tenantId, Sync_Enabled: true });
  await withTenantContext(() => postJournal({
    tenantId: tenant.tenantId, sourceType: 'JOURNAL', reference: 'TEST-WITH-TALLY',
    lines: [
      { account: 'Cash Account', group: 'Assets', sub: 'Cash', type: 'Dr', amount: 100 },
      { account: 'Sales Account', group: 'Income', sub: 'Direct Income', type: 'Cr', amount: 100 },
    ],
  }));
  const queued = await db('tbl_tally_sync_log').where({ Tenant_ID: tenant.tenantId, Status: 'Pending' });
  expect(queued).toHaveLength(1);

  await db('tbl_tally_sync_log').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_tally_config').where({ Tenant_ID: tenant.tenantId }).del();
});

test('getOrCreateAccount resolves an existing account by name without creating a duplicate', async () => {
  const first = await getOrCreateAccount(db, tenant.tenantId, 'Cash Account', 'Assets', 'Cash');
  const second = await getOrCreateAccount(db, tenant.tenantId, 'Cash Account', 'Assets', 'Cash');
  expect(first.Account_ID).toBe(second.Account_ID);
});

test('regression: concurrent posts for the same tenant never silently drop a journal', async () => {
  // Found via Day Close, which fires its cash-expense and cash-shortage
  // postings unawaited, back-to-back — both would independently read the
  // same "last journal number" and race to insert it, and the loser used
  // to fail into a swallowed .catch() with nothing to show for it.
  //
  // 5 concurrent posts was the original repro and is NOT enough to guard
  // against this — a later real-world case (4 of 7 real sales silently
  // lost their accounting entry) needed an actual stress test to catch:
  // firing 15 at once against the OLD "read last number, retry up to 5x
  // on collision" logic dropped 6 of them once every retry also
  // collided. 20 here is comfortably past where that old logic broke.
  const post = (ref) => withTenantContext(() => postJournal({
    tenantId: tenant.tenantId, sourceType: 'JOURNAL', reference: ref, narration: 'concurrency test',
    lines: [
      { account: 'Cash Account', group: 'Assets', sub: 'Cash', type: 'Dr', amount: 10 },
      { account: 'Sales Account', group: 'Income', sub: 'Direct Income', type: 'Cr', amount: 10 },
    ],
  }));
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => post(`CONC-${i}`)));
  const numbers = results.map((r) => r.status === 'fulfilled' ? r.value.journalNumber : null);
  expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  expect(new Set(numbers).size).toBe(20); // every journal number is unique — none collided or got skipped
});

test('getOrCreateAccount creates a real, visible new account on first use of a new name', async () => {
  const account = await getOrCreateAccount(db, tenant.tenantId, 'Brand New Test Ledger', 'Expenses', 'Indirect Expense');
  expect(account.Is_System).toBe(false);
  const found = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenant.tenantId, Account_Name: 'Brand New Test Ledger' }).first();
  expect(found).toBeDefined();
  await db('tbl_chart_of_accounts').where({ Account_ID: account.Account_ID }).del();
});
