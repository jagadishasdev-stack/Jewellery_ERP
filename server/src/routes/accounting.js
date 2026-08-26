/**
 * Accounting Reports — Ledger, Trial Balance, Day Book, Cash/Bank Book,
 * P&L, Balance Sheet, and the accounting dashboard KPI strip. Every report
 * here is a read-only VIEW over the same journal engine (utils/accountingEngine.js)
 * everything else posts through — none of these compute or store their
 * own numbers, so they can never drift from what was actually posted.
 *
 * Balance convention used throughout: for Assets/Expenses the "natural"
 * balance is Dr − Cr; for Liabilities/Capital/Income it's Cr − Dr. Trial
 * Balance then displays whichever side each account's NET balance actually
 * falls on (not its group's natural side) — that's what makes the two
 * columns sum to the same total, which is the whole point of a trial balance.
 */
const router = require('express').Router();
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');
const { postJournal } = require('../utils/accountingEngine');
const { requireValidBranch, withBranch, resolveBranchForInsert } = require('../utils/branchAccess');
const dayjs = require('dayjs');

// NOT new Date().toISOString().split('T')[0] — that reads UTC, but every
// date comparison against Postgres here runs in the DB session's
// Asia/Kolkata timezone. For the ~5.5 hours after midnight IST but before
// midnight UTC, toISOString() still reports YESTERDAY's date, so every
// "today's sales" / trial-balance-as-of-today figure would silently read
// the wrong day. dayjs() uses the process's local timezone (IST on this
// server), matching what Postgres itself considers "today" — the same
// convention already used everywhere else in this codebase (sales.js,
// savingsScheme.js, etc.); this file was the one outlier.
const today = () => dayjs().format('YYYY-MM-DD');
// India's financial year: 1-Apr to 31-Mar. Used as the default report
// window when no explicit from/to is given, matching the design doc's own
// "Financial Year" concept — not a full FY master-data table (no lock/close
// UI yet), just the boundary math reports fall back to.
function currentFinancialYear() {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // Apr(3)=FY start month
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` };
}

// ── GET /api/accounting/chart-of-accounts ──────────────────────────────────────
router.get('/chart-of-accounts', authenticate, requirePermission('accounts'), async (req, res) => {
  try {
    const rows = await db('tbl_chart_of_accounts').where({ Tenant_ID: req.user.tenantId, Is_Active: true }).orderBy('Account_Code');
    return sendSuccess(res, rows);
  } catch (err) { return sendError(res, 500, 'Failed to fetch chart of accounts.'); }
});

// ── POST /api/accounting/chart-of-accounts — add a new ledger by hand ──────────
// postJournal()'s getOrCreateAccount already creates a ledger the first
// time any voucher references a new name, but a real business also wants
// to set up accounts BEFORE the first transaction (an expense head they
// know they'll need, a new supplier's payable, etc.) — this is that.
router.post('/chart-of-accounts', authenticate, requirePermission('accounts'), async (req, res) => {
  const tenantId = req.user.tenantId;
  const { Account_Name, Account_Group, Account_Sub_Group, Opening_Balance, Opening_Balance_Type } = req.body;
  const validGroups = ['Assets', 'Liabilities', 'Capital', 'Income', 'Expenses'];
  if (!Account_Name?.trim() || !validGroups.includes(Account_Group)) {
    return sendError(res, 400, `Account_Name is required and Account_Group must be one of ${validGroups.join(', ')}.`);
  }
  try {
    const existing = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Account_Name: Account_Name.trim() }).first();
    if (existing) return sendError(res, 400, `An account named "${Account_Name.trim()}" already exists.`);

    const last = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Account_Group }).orderBy('Account_Code', 'desc').first();
    const prefixMap = { Assets: '19', Liabilities: '29', Capital: '39', Income: '49', Expenses: '59' };
    const nextCode = last ? String(parseInt(last.Account_Code) + 1) : `${prefixMap[Account_Group]}00`;

    const name = Account_Name.trim();
    const openingAmount = parseFloat(Opening_Balance || 0);
    const openingType = Opening_Balance_Type === 'Cr' ? 'Cr' : 'Dr';

    // Opening_Balance is deliberately NOT stored on the row here — see the
    // postJournal() call below. A static "starting balance" field that
    // Trial Balance/Ledger both silently add in, with nothing ever posted
    // to whatever the offsetting side should be, breaks the one invariant
    // this whole engine exists to protect (Dr must always equal Cr) —
    // found via a real case: a bank account created this way left the
    // books permanently unbalanced by its exact opening amount.
    const [row] = await db('tbl_chart_of_accounts').insert({
      Tenant_ID: tenantId, Account_Code: nextCode, Account_Name: name,
      Account_Group, Account_Sub_Group: Account_Sub_Group || null,
      Is_System: false, Created_By: req.user.username,
    }).returning('*');

    if (openingAmount > 0) {
      await postJournal({
        tenantId, sourceType: 'JOURNAL', reference: `OPENING-${row.Account_ID}`,
        narration: `Opening balance — ${name}`, createdBy: req.user.username,
        lines: [
          { account: name, group: Account_Group, sub: Account_Sub_Group || null, type: openingType, amount: openingAmount },
          { account: 'Owner Capital Account', group: 'Capital', sub: 'Capital', type: openingType === 'Dr' ? 'Cr' : 'Dr', amount: openingAmount },
        ],
      }).catch((err) => console.error('[Accounting] Opening balance journal failed (account still created fine):', err.message));
    }

    return sendSuccess(res, row, 'Ledger account created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create ledger account.'); }
});

// ── PATCH /api/accounting/chart-of-accounts/:id/deactivate ─────────────────────
// A ledger is never hard-deleted (it may already have entries against it) —
// deactivating just hides it from new voucher pickers; its history stays
// fully intact and still shows up in the Ledger/Trial Balance reports.
// System accounts (the ones the engine itself depends on, like "Cash
// Account" or a bank-linked ledger) can't be deactivated from here.
router.patch('/chart-of-accounts/:id/deactivate', authenticate, requirePermission('accounts'), async (req, res) => {
  try {
    const account = await db('tbl_chart_of_accounts').where({ Account_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!account) return sendError(res, 404, 'Account not found.');
    if (account.Is_System) return sendError(res, 400, 'This is a system account and cannot be deactivated.');
    const [row] = await db('tbl_chart_of_accounts').where({ Account_ID: account.Account_ID }).update({ Is_Active: false }).returning('*');
    return sendSuccess(res, row, 'Account deactivated.');
  } catch (err) { return sendError(res, 500, 'Failed to deactivate account.'); }
});

// ── GET /api/accounting/ledger/:accountId ──────────────────────────────────────
// Full transaction history for one account, with a running balance.
router.get('/ledger/:accountId', authenticate, requirePermission('accounts'), async (req, res) => {
  const tenantId = req.user.tenantId;
  const { from, to } = req.query;
  try {
    const account = await db('tbl_chart_of_accounts').where({ Account_ID: req.params.accountId, Tenant_ID: tenantId }).first();
    if (!account) return sendError(res, 404, 'Account not found.');

    const natural = ['Assets', 'Expenses'].includes(account.Account_Group) ? 1 : -1;
    const openingSigned = account.Opening_Balance_Type === 'Dr' ? parseFloat(account.Opening_Balance) : -parseFloat(account.Opening_Balance);

    // Opening balance AS OF the report window's start = the account's own
    // opening balance plus every entry strictly before `from`.
    let runningBalance = openingSigned * natural;
    if (from) {
      const priorRows = await db('tbl_accounting_entries as e')
        .join('tbl_accounting_journal as j', 'e.Journal_ID', 'j.Journal_ID')
        .where({ 'e.Account_ID': account.Account_ID, 'e.Tenant_ID': tenantId })
        .where('j.Entry_Date', '<', from)
        .select('e.Entry_Type', 'e.Amount');
      for (const r of priorRows) runningBalance += (r.Entry_Type === 'Dr' ? 1 : -1) * parseFloat(r.Amount) * natural;
    }
    const openingForWindow = runningBalance;

    let qb = db('tbl_accounting_entries as e')
      .join('tbl_accounting_journal as j', 'e.Journal_ID', 'j.Journal_ID')
      .where({ 'e.Account_ID': account.Account_ID, 'e.Tenant_ID': tenantId })
      .select('j.Journal_Number', 'j.Entry_Date', 'j.Source_Type', 'j.Reference', 'e.Entry_Type', 'e.Amount', 'e.Narration')
      .orderBy('j.Entry_Date').orderBy('e.Entry_ID');
    if (from) qb = qb.where('j.Entry_Date', '>=', from);
    if (to) qb = qb.where('j.Entry_Date', '<=', to);
    const rows = await qb;

    const withBalance = rows.map((r) => {
      runningBalance += (r.Entry_Type === 'Dr' ? 1 : -1) * parseFloat(r.Amount) * natural;
      return { ...r, Running_Balance: Math.round(runningBalance * 100) / 100 };
    });

    return sendSuccess(res, { account, openingBalance: Math.round(openingForWindow * 100) / 100, entries: withBalance, closingBalance: Math.round(runningBalance * 100) / 100 });
  } catch (err) { console.error('Ledger error:', err.message); return sendError(res, 500, 'Failed to fetch ledger.'); }
});

// ── Branch-specific opening balances (Multi-Branch Management) ────────────────
// See this table's own migration comment (20260830000000_add_branch_opening_
// balances.js) for the full reasoning. Gated by the same 'accounts'
// permission as the rest of this file's chart-of-accounts/voucher routes.

// GET /api/accounting/branch-opening-balances?branchId=X — every active
// account for this tenant, with its branch-specific opening balance (0/Dr
// if never allocated — Has_Branch_Balance distinguishes "actually zero"
// from "not yet allocated") alongside the account's own tenant-wide
// figure, so an admin can see at a glance what still needs allocating.
router.get('/branch-opening-balances', authenticate, requirePermission('accounts'), async (req, res) => {
  const { branchId } = req.query;
  if (!branchId) return sendError(res, 400, 'branchId is required.');
  try {
    const tenantId = req.user.tenantId;
    const accounts = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Is_Active: true }).orderBy('Account_Code');
    const branchBalances = await db('tbl_account_branch_opening_balance').where({ Tenant_ID: tenantId, Branch_ID: branchId });
    const byAccount = Object.fromEntries(branchBalances.map((b) => [b.Account_ID, b]));

    const rows = accounts.map((a) => {
      const b = byAccount[a.Account_ID];
      return {
        Account_ID: a.Account_ID, Account_Code: a.Account_Code, Account_Name: a.Account_Name,
        Account_Group: a.Account_Group, Account_Sub_Group: a.Account_Sub_Group,
        Tenant_Opening_Balance: parseFloat(a.Opening_Balance || 0), Tenant_Opening_Balance_Type: a.Opening_Balance_Type,
        Branch_Opening_Balance: b ? parseFloat(b.Opening_Balance) : 0,
        Branch_Opening_Balance_Type: b ? b.Opening_Balance_Type : 'Dr',
        Has_Branch_Balance: !!b,
      };
    });
    return sendSuccess(res, rows);
  } catch (err) { return sendError(res, 500, 'Failed to fetch branch opening balances.'); }
});

// PUT /api/accounting/branch-opening-balances — upsert ONE account's
// opening balance for ONE branch.
router.put('/branch-opening-balances', authenticate, requirePermission('accounts'), async (req, res) => {
  const { Account_ID, Branch_ID, Opening_Balance, Opening_Balance_Type } = req.body;
  if (!Account_ID || !Branch_ID) return sendError(res, 400, 'Account_ID and Branch_ID are required.');
  if (!['Dr', 'Cr'].includes(Opening_Balance_Type)) return sendError(res, 400, "Opening_Balance_Type must be 'Dr' or 'Cr'.");
  try {
    const tenantId = req.user.tenantId;
    const account = await db('tbl_chart_of_accounts').where({ Account_ID, Tenant_ID: tenantId }).first();
    if (!account) return sendError(res, 404, 'Account not found.');

    const existing = await db('tbl_account_branch_opening_balance').where({ Account_ID, Branch_ID }).first();
    let row;
    if (existing) {
      [row] = await db('tbl_account_branch_opening_balance').where({ Balance_ID: existing.Balance_ID })
        .update({ Opening_Balance: Opening_Balance || 0, Opening_Balance_Type, Modified_By: req.user.username, Modified_Date: new Date() })
        .returning('*');
    } else {
      [row] = await db('tbl_account_branch_opening_balance').insert({
        Tenant_ID: tenantId, Account_ID, Branch_ID, Opening_Balance: Opening_Balance || 0, Opening_Balance_Type, Created_By: req.user.username,
      }).returning('*');
    }
    return sendSuccess(res, row, 'Branch opening balance saved.');
  } catch (err) { return sendError(res, 500, 'Failed to save branch opening balance.'); }
});

// GET /api/accounting/branch-opening-balances/reconcile?accountId=X —
// sum of what's been allocated across ALL branches for one account vs.
// the account's own tenant-wide Opening_Balance. A mismatch isn't
// blocked (a business might genuinely want branch totals that don't sum
// to the tenant figure, e.g. a new branch opened after the tenant-wide
// balance was set) — just surfaced, so it's a visible fact, not a silent one.
router.get('/branch-opening-balances/reconcile', authenticate, requirePermission('accounts'), async (req, res) => {
  const { accountId } = req.query;
  if (!accountId) return sendError(res, 400, 'accountId is required.');
  try {
    const tenantId = req.user.tenantId;
    const account = await db('tbl_chart_of_accounts').where({ Account_ID: accountId, Tenant_ID: tenantId }).first();
    if (!account) return sendError(res, 404, 'Account not found.');
    const branchRows = await db('tbl_account_branch_opening_balance').where({ Account_ID: accountId, Tenant_ID: tenantId });
    const allocatedNet = branchRows.reduce((s, b) => s + (b.Opening_Balance_Type === 'Dr' ? parseFloat(b.Opening_Balance) : -parseFloat(b.Opening_Balance)), 0);
    const tenantNet = account.Opening_Balance_Type === 'Dr' ? parseFloat(account.Opening_Balance) : -parseFloat(account.Opening_Balance);
    return sendSuccess(res, {
      tenantNet: Math.round(tenantNet * 100) / 100,
      allocatedNet: Math.round(allocatedNet * 100) / 100,
      unallocated: Math.round((tenantNet - allocatedNet) * 100) / 100,
      branchesAllocated: branchRows.length,
    });
  } catch (err) { return sendError(res, 500, 'Failed to reconcile.'); }
});

// ── GET /api/accounting/trial-balance ──────────────────────────────────────────
// Multi-Branch Management — branch-filterable, correctly. "All Branches"
// (or no branch context) reads the account's own tenant-wide
// Opening_Balance, completely unchanged from before this feature existed.
// A SPECIFIC branch instead reads that account's row in
// tbl_account_branch_opening_balance (0/Dr if never allocated — see that
// table's migration comment for why this is the honest default, not a
// guess), and the entries themselves are filtered to that branch too —
// so the two now genuinely match instead of mixing a tenant-wide
// starting point with branch-only movement.
router.get('/trial-balance', authenticate, requirePermission('accounts'), requireValidBranch, async (req, res) => {
  const tenantId = req.user.tenantId;
  const to = req.query.to || today();
  const branchId = req.branchId && req.branchId !== 'ALL' ? req.branchId : null;
  try {
    const accounts = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Is_Active: true }).orderBy('Account_Code');

    let branchOpeningMap = {};
    if (branchId) {
      const branchBalances = await db('tbl_account_branch_opening_balance').where({ Tenant_ID: tenantId, Branch_ID: branchId });
      branchOpeningMap = Object.fromEntries(branchBalances.map((b) => [b.Account_ID, b]));
    }

    let entriesQb = db('tbl_accounting_entries as e')
      .join('tbl_accounting_journal as j', 'e.Journal_ID', 'j.Journal_ID')
      .where({ 'e.Tenant_ID': tenantId }).where('j.Entry_Date', '<=', to);
    if (branchId) entriesQb = entriesQb.where('j.Branch_ID', branchId);
    const totals = await entriesQb
      .groupBy('e.Account_ID', 'e.Entry_Type')
      .select('e.Account_ID', 'e.Entry_Type').sum('e.Amount as total');
    const byAccount = {};
    for (const t of totals) {
      byAccount[t.Account_ID] = byAccount[t.Account_ID] || { dr: 0, cr: 0 };
      byAccount[t.Account_ID][t.Entry_Type === 'Dr' ? 'dr' : 'cr'] = parseFloat(t.total);
    }

    let totalDr = 0, totalCr = 0;
    const rows = accounts.map((a) => {
      const t = byAccount[a.Account_ID] || { dr: 0, cr: 0 };
      let openingBalance, openingType;
      if (branchId) {
        const b = branchOpeningMap[a.Account_ID];
        openingBalance = b ? parseFloat(b.Opening_Balance) : 0;
        openingType = b ? b.Opening_Balance_Type : 'Dr';
      } else {
        openingBalance = parseFloat(a.Opening_Balance || 0);
        openingType = a.Opening_Balance_Type;
      }
      const openingDr = openingType === 'Dr' ? openingBalance : 0;
      const openingCr = openingType === 'Cr' ? openingBalance : 0;
      const netDr = Math.round(((openingDr + t.dr) - (openingCr + t.cr)) * 100) / 100;
      const drBalance = netDr > 0 ? netDr : 0;
      const crBalance = netDr < 0 ? -netDr : 0;
      totalDr += drBalance; totalCr += crBalance;
      return { Account_ID: a.Account_ID, Account_Code: a.Account_Code, Account_Name: a.Account_Name, Account_Group: a.Account_Group, Dr_Balance: drBalance, Cr_Balance: crBalance };
    }).filter((r) => r.Dr_Balance !== 0 || r.Cr_Balance !== 0);

    return sendSuccess(res, {
      asOf: to, branchId, rows,
      totalDr: Math.round(totalDr * 100) / 100, totalCr: Math.round(totalCr * 100) / 100,
      isBalanced: Math.abs(totalDr - totalCr) < 0.01,
    });
  } catch (err) { console.error('Trial balance error:', err.message); return sendError(res, 500, 'Failed to fetch trial balance.'); }
});

// ── GET /api/accounting/day-book ────────────────────────────────────────────────
// Branch-filterable — a pure date-scoped voucher listing with no opening-
// balance/running-balance math to get wrong by narrowing which journals
// are included (unlike trial-balance/cash-book/bank-book, which need the
// branch-specific-opening-balance machinery above to be filtered correctly).
router.get('/day-book', authenticate, requirePermission('accounts'), requireValidBranch, async (req, res) => {
  const tenantId = req.user.tenantId;
  const date = req.query.date || today();
  try {
    let journalsQb = db('tbl_accounting_journal').where({ Tenant_ID: tenantId, Entry_Date: date });
    journalsQb = withBranch(journalsQb, req);
    const journals = await journalsQb.orderBy('Journal_ID');
    const entries = await db('tbl_accounting_entries').whereIn('Journal_ID', journals.map((j) => j.Journal_ID));
    const byJournal = {};
    for (const e of entries) { (byJournal[e.Journal_ID] = byJournal[e.Journal_ID] || []).push(e); }
    const rows = journals.map((j) => ({ ...j, entries: byJournal[j.Journal_ID] || [] }));
    return sendSuccess(res, { date, vouchers: rows, count: rows.length });
  } catch (err) { return sendError(res, 500, 'Failed to fetch day book.'); }
});

// ── Shared helper: ledger-style view for one or more accounts by sub-group ─────
// Feeds Cash Book / Bank Book below. branchId is null for "All Branches"
// / no branch context — in that case behavior is byte-for-byte the same
// as before this feature: tenant-wide Opening_Balance, entries not
// narrowed by branch. When branchId IS a specific branch, opening balance
// comes from tbl_account_branch_opening_balance (0/Dr if never
// allocated — same honest default as trial-balance) and entries are
// narrowed to that branch's journals, so the running Balance column is
// actually correct for that branch instead of mixing a tenant-wide
// starting point with branch-only movement.
async function bookFor(tenantId, subGroup, from, to, extraWhere = {}, branchId = null) {
  let accountsQb = db('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Account_Sub_Group: subGroup, ...extraWhere });
  const accounts = await accountsQb;

  let branchOpeningMap = {};
  if (branchId) {
    const branchBalances = await db('tbl_account_branch_opening_balance').where({ Tenant_ID: tenantId, Branch_ID: branchId });
    branchOpeningMap = Object.fromEntries(branchBalances.map((b) => [b.Account_ID, b]));
  }

  const results = [];
  for (const account of accounts) {
    let qb = db('tbl_accounting_entries as e')
      .join('tbl_accounting_journal as j', 'e.Journal_ID', 'j.Journal_ID')
      .where({ 'e.Account_ID': account.Account_ID })
      .select('j.Entry_Date', 'j.Journal_Number', 'j.Source_Type', 'e.Entry_Type', 'e.Amount', 'e.Narration')
      .orderBy('j.Entry_Date');
    if (from) qb = qb.where('j.Entry_Date', '>=', from);
    if (to) qb = qb.where('j.Entry_Date', '<=', to);
    if (branchId) qb = qb.where('j.Branch_ID', branchId);
    const entries = await qb;

    let openingBalance, openingType;
    if (branchId) {
      const b = branchOpeningMap[account.Account_ID];
      openingBalance = b ? parseFloat(b.Opening_Balance) : 0;
      openingType = b ? b.Opening_Balance_Type : 'Dr';
    } else {
      openingBalance = parseFloat(account.Opening_Balance || 0);
      openingType = account.Opening_Balance_Type;
    }
    let balance = openingType === 'Dr' ? openingBalance : -openingBalance;
    const withBalance = entries.map((e) => {
      balance += (e.Entry_Type === 'Dr' ? 1 : -1) * parseFloat(e.Amount);
      return { ...e, Balance: Math.round(balance * 100) / 100 };
    });
    results.push({ account, entries: withBalance, closingBalance: Math.round(balance * 100) / 100 });
  }
  return results;
}

// ── GET /api/accounting/cash-book ───────────────────────────────────────────────
router.get('/cash-book', authenticate, requirePermission('accounts'), requireValidBranch, async (req, res) => {
  try {
    const branchId = req.branchId && req.branchId !== 'ALL' ? req.branchId : null;
    const books = await bookFor(req.user.tenantId, 'Cash', req.query.from, req.query.to, {}, branchId);
    return sendSuccess(res, books[0] || { entries: [], closingBalance: 0 });
  } catch (err) { return sendError(res, 500, 'Failed to fetch cash book.'); }
});

// ── GET /api/accounting/bank-book ───────────────────────────────────────────────
// One book per real bank ledger (Is_Bank_Account=true) — this is the
// concrete "each bank account gets its own book" requirement.
router.get('/bank-book', authenticate, requirePermission('accounts'), requireValidBranch, async (req, res) => {
  try {
    const branchId = req.branchId && req.branchId !== 'ALL' ? req.branchId : null;
    const books = await bookFor(req.user.tenantId, 'Bank', req.query.from, req.query.to, { Is_Bank_Account: true }, branchId);
    const unassigned = await bookFor(req.user.tenantId, 'Bank', req.query.from, req.query.to, { Is_Bank_Account: false }, branchId);
    return sendSuccess(res, [...books, ...unassigned]);
  } catch (err) { return sendError(res, 500, 'Failed to fetch bank book.'); }
});

// ── GET /api/accounting/profit-loss ─────────────────────────────────────────────
// Branch-filterable unlike trial-balance/balance-sheet — P&L is pure
// period Income/Expense flow with no opening-balance concept at all, so
// narrowing the entries by branch has none of the double-counting risk
// those two have to guard against (see tbl_account_branch_opening_balance's
// own migration comment). "All Branches"/no branch context is unaffected.
router.get('/profit-loss', authenticate, requirePermission('accounts'), requireValidBranch, async (req, res) => {
  const tenantId = req.user.tenantId;
  const fy = currentFinancialYear();
  const from = req.query.from || fy.from;
  const to = req.query.to || fy.to;
  const branchId = req.branchId && req.branchId !== 'ALL' ? req.branchId : null;
  try {
    const accounts = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Is_Active: true }).whereIn('Account_Group', ['Income', 'Expenses']);
    let totalsQb = db('tbl_accounting_entries as e')
      .join('tbl_accounting_journal as j', 'e.Journal_ID', 'j.Journal_ID')
      .where({ 'e.Tenant_ID': tenantId }).whereBetween('j.Entry_Date', [from, to])
      .whereIn('e.Account_ID', accounts.map((a) => a.Account_ID));
    if (branchId) totalsQb = totalsQb.where('j.Branch_ID', branchId);
    const totals = await totalsQb
      .groupBy('e.Account_ID', 'e.Entry_Type').select('e.Account_ID', 'e.Entry_Type').sum('e.Amount as total');

    const byAccount = {};
    for (const t of totals) { byAccount[t.Account_ID] = byAccount[t.Account_ID] || { dr: 0, cr: 0 }; byAccount[t.Account_ID][t.Entry_Type === 'Dr' ? 'dr' : 'cr'] = parseFloat(t.total); }

    let totalIncome = 0, totalExpense = 0;
    const income = [], expenses = [];
    for (const a of accounts) {
      const t = byAccount[a.Account_ID] || { dr: 0, cr: 0 };
      if (a.Account_Group === 'Income') {
        const amt = Math.round((t.cr - t.dr) * 100) / 100;
        if (amt !== 0) { income.push({ Account_Name: a.Account_Name, Amount: amt }); totalIncome += amt; }
      } else {
        const amt = Math.round((t.dr - t.cr) * 100) / 100;
        if (amt !== 0) { expenses.push({ Account_Name: a.Account_Name, Amount: amt }); totalExpense += amt; }
      }
    }
    const netProfit = Math.round((totalIncome - totalExpense) * 100) / 100;
    return sendSuccess(res, { from, to, income, expenses, totalIncome: Math.round(totalIncome * 100) / 100, totalExpense: Math.round(totalExpense * 100) / 100, netProfit });
  } catch (err) { console.error('P&L error:', err.message); return sendError(res, 500, 'Failed to compute P&L.'); }
});

// ── GET /api/accounting/balance-sheet ───────────────────────────────────────────
// Branch-filterable using the same tbl_account_branch_opening_balance
// mechanism as trial-balance above (see that route's own comment, and
// the table's migration comment, for the full reasoning). "All Branches"
// / no branch context is byte-for-byte unchanged — still reads each
// account's tenant-wide Opening_Balance directly.
router.get('/balance-sheet', authenticate, requirePermission('accounts'), requireValidBranch, async (req, res) => {
  const tenantId = req.user.tenantId;
  const asOf = req.query.asOf || today();
  const branchId = req.branchId && req.branchId !== 'ALL' ? req.branchId : null;
  try {
    const accounts = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Is_Active: true }).whereIn('Account_Group', ['Assets', 'Liabilities', 'Capital']);

    let branchOpeningMap = {};
    if (branchId) {
      const branchBalances = await db('tbl_account_branch_opening_balance').where({ Tenant_ID: tenantId, Branch_ID: branchId });
      branchOpeningMap = Object.fromEntries(branchBalances.map((b) => [b.Account_ID, b]));
    }

    let totalsQb = db('tbl_accounting_entries as e')
      .join('tbl_accounting_journal as j', 'e.Journal_ID', 'j.Journal_ID')
      .where({ 'e.Tenant_ID': tenantId }).where('j.Entry_Date', '<=', asOf)
      .whereIn('e.Account_ID', accounts.map((a) => a.Account_ID));
    if (branchId) totalsQb = totalsQb.where('j.Branch_ID', branchId);
    const totals = await totalsQb
      .groupBy('e.Account_ID', 'e.Entry_Type').select('e.Account_ID', 'e.Entry_Type').sum('e.Amount as total');
    const byAccount = {};
    for (const t of totals) { byAccount[t.Account_ID] = byAccount[t.Account_ID] || { dr: 0, cr: 0 }; byAccount[t.Account_ID][t.Entry_Type === 'Dr' ? 'dr' : 'cr'] = parseFloat(t.total); }

    const groups = { Assets: [], Liabilities: [], Capital: [] };
    let totalAssets = 0, totalLiabilities = 0, totalCapital = 0;
    for (const a of accounts) {
      const t = byAccount[a.Account_ID] || { dr: 0, cr: 0 };
      let openingBalance, openingType;
      if (branchId) {
        const b = branchOpeningMap[a.Account_ID];
        openingBalance = b ? parseFloat(b.Opening_Balance) : 0;
        openingType = b ? b.Opening_Balance_Type : 'Dr';
      } else {
        openingBalance = parseFloat(a.Opening_Balance || 0);
        openingType = a.Opening_Balance_Type;
      }
      const openingDr = openingType === 'Dr' ? openingBalance : 0;
      const openingCr = openingType === 'Cr' ? openingBalance : 0;
      const natural = a.Account_Group === 'Assets' ? ((openingDr + t.dr) - (openingCr + t.cr)) : ((openingCr + t.cr) - (openingDr + t.dr));
      const amt = Math.round(natural * 100) / 100;
      if (amt === 0) continue;
      groups[a.Account_Group].push({ Account_Name: a.Account_Name, Amount: amt });
      if (a.Account_Group === 'Assets') totalAssets += amt;
      else if (a.Account_Group === 'Liabilities') totalLiabilities += amt;
      else totalCapital += amt;
    }

    // Current period's P&L rolls into Capital as "Current Profit" — real
    // retained-earnings closing only happens at financial-year-end (not
    // built yet, see the comment on currentFinancialYear()); until then,
    // the balance sheet needs this to actually balance day-to-day. Branch-
    // filtered the same as the main totals above — an unfiltered P&L
    // folded into a branch-filtered Assets/Liabilities would never balance.
    const fy = currentFinancialYear();
    let plTotalsQb = db('tbl_accounting_entries as e')
      .join('tbl_accounting_journal as j', 'e.Journal_ID', 'j.Journal_ID')
      .join('tbl_chart_of_accounts as a', 'e.Account_ID', 'a.Account_ID')
      .where({ 'e.Tenant_ID': tenantId }).whereIn('a.Account_Group', ['Income', 'Expenses']).where('j.Entry_Date', '<=', asOf).where('j.Entry_Date', '>=', fy.from);
    if (branchId) plTotalsQb = plTotalsQb.where('j.Branch_ID', branchId);
    const plTotals = await plTotalsQb
      .select('a.Account_Group', 'e.Entry_Type').sum('e.Amount as total').groupBy('a.Account_Group', 'e.Entry_Type');
    let income = 0, expense = 0;
    for (const t of plTotals) {
      if (t.Account_Group === 'Income') income += (t.Entry_Type === 'Cr' ? 1 : -1) * parseFloat(t.total);
      else expense += (t.Entry_Type === 'Dr' ? 1 : -1) * parseFloat(t.total);
    }
    const currentProfit = Math.round((income - expense) * 100) / 100;
    if (currentProfit !== 0) { groups.Capital.push({ Account_Name: 'Current Period Profit/Loss', Amount: currentProfit }); totalCapital += currentProfit; }

    return sendSuccess(res, {
      asOf, ...groups,
      totalAssets: Math.round(totalAssets * 100) / 100,
      totalLiabilities: Math.round(totalLiabilities * 100) / 100,
      totalCapital: Math.round(totalCapital * 100) / 100,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalCapital)) < 0.01,
    });
  } catch (err) { console.error('Balance sheet error:', err.message); return sendError(res, 500, 'Failed to compute balance sheet.'); }
});

// ── GET /api/accounting/dashboard ───────────────────────────────────────────────
// The KPI strip from the design doc: today's sales/purchase, receivables,
// payables, cash, bank, GST payable, stock value, plus a P&L + GST snippet.
router.get('/dashboard', authenticate, requirePermission('accounts'), async (req, res) => {
  const tenantId = req.user.tenantId;
  const t = today();
  try {
    const [todaySales] = await db('tbl_sales_header').where({ Tenant_ID: tenantId }).whereRaw('"Sale_Date"::date = ?', [t]).sum('Net_Payable_Amount as total');
    const [todayPurchase] = await db('tbl_purchase_header').where({ Tenant_ID: tenantId }).whereRaw('"Purchase_Date"::date = ?', [t]).sum('Total_Amount as total');

    const accounts = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Is_Active: true });
    const totals = await db('tbl_accounting_entries as e')
      .join('tbl_accounting_journal as j', 'e.Journal_ID', 'j.Journal_ID')
      .where({ 'e.Tenant_ID': tenantId })
      .groupBy('e.Account_ID', 'e.Entry_Type').select('e.Account_ID', 'e.Entry_Type').sum('e.Amount as total');
    const byAccount = {};
    for (const x of totals) { byAccount[x.Account_ID] = byAccount[x.Account_ID] || { dr: 0, cr: 0 }; byAccount[x.Account_ID][x.Entry_Type === 'Dr' ? 'dr' : 'cr'] = parseFloat(x.total); }
    const balanceOf = (name) => {
      const a = accounts.find((x) => x.Account_Name === name);
      if (!a) return 0;
      const tt = byAccount[a.Account_ID] || { dr: 0, cr: 0 };
      return ['Assets', 'Expenses'].includes(a.Account_Group) ? tt.dr - tt.cr : tt.cr - tt.dr;
    };
    const sumByGroupSub = (group, sub) => {
      const matching = accounts.filter((a) => a.Account_Group === group && (!sub || a.Account_Sub_Group === sub));
      return matching.reduce((s, a) => {
        const tt = byAccount[a.Account_ID] || { dr: 0, cr: 0 };
        return s + (group === 'Assets' ? tt.dr - tt.cr : tt.cr - tt.dr);
      }, 0);
    };

    const cashBalance = balanceOf('Cash Account');
    const bankBalance = sumByGroupSub('Assets', 'Bank');
    const receivables = sumByGroupSub('Assets', 'Receivable');
    const payables = sumByGroupSub('Liabilities', 'Payable');
    const gstPayable = balanceOf('Output CGST Account') + balanceOf('Output SGST Account') + balanceOf('Output IGST Account')
      - balanceOf('Input CGST Account') - balanceOf('Input SGST Account') - balanceOf('Input IGST Account');

    const [stockValue] = await db('tbl_ornament_master').where({ Tenant_ID: tenantId, Is_Sold: false, Is_Active: true }).sum('Purchase_Cost as total');

    return sendSuccess(res, {
      todaySales: parseFloat(todaySales.total || 0),
      todayPurchase: parseFloat(todayPurchase.total || 0),
      receivables: Math.round(receivables * 100) / 100,
      payables: Math.round(payables * 100) / 100,
      cashBalance: Math.round(cashBalance * 100) / 100,
      bankBalance: Math.round(bankBalance * 100) / 100,
      gstPayable: Math.round(gstPayable * 100) / 100,
      stockValue: parseFloat(stockValue.total || 0),
    });
  } catch (err) { console.error('Accounting dashboard error:', err.message); return sendError(res, 500, 'Failed to compute accounting dashboard.'); }
});

// ════════════════════════════════════════════════════════════════════════════
// MANUAL VOUCHER ENTRY — Receipt, Payment, Contra, Journal
// ════════════════════════════════════════════════════════════════════════════
// Sales and Purchase post themselves automatically; these 4 are for
// everything else a real business needs to record by hand — a customer
// paying down their balance, a supplier payment, moving money between two
// of your own bank accounts, or a plain adjustment (depreciation,
// provisions, corrections) that isn't really any of the above. All four
// are thin wrappers that build the right Dr/Cr lines and hand them to the
// same postJournal() everything else uses — same balance check, same
// Tally auto-queue, same bank-balance sync.
//
// requirePermission('accounts') — matches the existing "Accounts" role's
// own permission flag; a Billing Operator or Store Manager shouldn't be
// able to post ledger adjustments.

// ── POST /api/accounting/voucher/receipt — money received ──────────────────────
// Dr the account money landed IN (Cash/Bank), Cr the account it came FROM
// (a customer's receivable balance, by default — or any other account).
router.post('/voucher/receipt', authenticate, requirePermission('accounts'), requireValidBranch, async (req, res) => {
  const { date, receivedInto, fromAccount, amount, narration } = req.body;
  if (!receivedInto || !fromAccount || !parseFloat(amount || 0)) {
    return sendError(res, 400, 'receivedInto, fromAccount, and a positive amount are required.');
  }
  try {
    const { journalId, journalNumber } = await postJournal({
      tenantId: req.user.tenantId, sourceType: 'RECEIPT', reference: narration, narration: narration || `Receipt — ${fromAccount}`,
      entryDate: date, createdBy: req.user.username, branchId: resolveBranchForInsert(req, req.body.Branch_ID),
      lines: [
        { account: receivedInto, type: 'Dr', amount: parseFloat(amount) },
        { account: fromAccount, type: 'Cr', amount: parseFloat(amount) },
      ],
    });
    return sendSuccess(res, { journalId, journalNumber }, 'Receipt recorded.', 201);
  } catch (err) { return sendError(res, 400, err.message); }
});

// ── POST /api/accounting/voucher/payment — money paid out ──────────────────────
// Dr the account being settled (a supplier's payable, by default — or any
// other account), Cr the account money left FROM (Cash/Bank).
router.post('/voucher/payment', authenticate, requirePermission('accounts'), requireValidBranch, async (req, res) => {
  const { date, paidFrom, toAccount, amount, narration } = req.body;
  if (!paidFrom || !toAccount || !parseFloat(amount || 0)) {
    return sendError(res, 400, 'paidFrom, toAccount, and a positive amount are required.');
  }
  try {
    const { journalId, journalNumber } = await postJournal({
      tenantId: req.user.tenantId, sourceType: 'PAYMENT', reference: narration, narration: narration || `Payment — ${toAccount}`,
      entryDate: date, createdBy: req.user.username, branchId: resolveBranchForInsert(req, req.body.Branch_ID),
      lines: [
        { account: toAccount, type: 'Dr', amount: parseFloat(amount) },
        { account: paidFrom, type: 'Cr', amount: parseFloat(amount) },
      ],
    });
    return sendSuccess(res, { journalId, journalNumber }, 'Payment recorded.', 201);
  } catch (err) { return sendError(res, 400, err.message); }
});

// ── POST /api/accounting/voucher/contra — moving your own money between your own accounts ──
// Never income or expense — Dr the account receiving, Cr the account it left.
router.post('/voucher/contra', authenticate, requirePermission('accounts'), requireValidBranch, async (req, res) => {
  const { date, fromAccount, toAccount, amount, narration } = req.body;
  if (!fromAccount || !toAccount || !parseFloat(amount || 0)) {
    return sendError(res, 400, 'fromAccount, toAccount, and a positive amount are required.');
  }
  if (fromAccount === toAccount) return sendError(res, 400, 'fromAccount and toAccount must be different.');
  try {
    const { journalId, journalNumber } = await postJournal({
      tenantId: req.user.tenantId, sourceType: 'CONTRA', reference: narration, narration: narration || `Transfer: ${fromAccount} → ${toAccount}`,
      entryDate: date, createdBy: req.user.username, branchId: resolveBranchForInsert(req, req.body.Branch_ID),
      lines: [
        { account: toAccount, type: 'Dr', amount: parseFloat(amount) },
        { account: fromAccount, type: 'Cr', amount: parseFloat(amount) },
      ],
    });
    return sendSuccess(res, { journalId, journalNumber }, 'Transfer recorded.', 201);
  } catch (err) { return sendError(res, 400, err.message); }
});

// ── POST /api/accounting/voucher/journal — general adjustment, any number of lines ──
// Depreciation, provisions, corrections, opening adjustments — anything
// that isn't a receipt/payment/transfer. Caller supplies the full Dr/Cr
// line list directly; postJournal() still enforces it balances.
router.post('/voucher/journal', authenticate, requirePermission('accounts'), requireValidBranch, async (req, res) => {
  const { date, narration, lines } = req.body;
  if (!Array.isArray(lines) || lines.length < 2) return sendError(res, 400, 'At least two lines (one Dr, one Cr) are required.');
  if (lines.some((l) => !l.account || !['Dr', 'Cr'].includes(l.type) || !parseFloat(l.amount || 0))) {
    return sendError(res, 400, 'Every line needs an account, a type of Dr or Cr, and a positive amount.');
  }
  try {
    const { journalId, journalNumber } = await postJournal({
      tenantId: req.user.tenantId, sourceType: 'JOURNAL', reference: narration, narration,
      entryDate: date, createdBy: req.user.username, branchId: resolveBranchForInsert(req, req.body.Branch_ID),
      lines: lines.map((l) => ({ account: l.account, type: l.type, amount: parseFloat(l.amount) })),
    });
    return sendSuccess(res, { journalId, journalNumber }, 'Journal entry recorded.', 201);
  } catch (err) { return sendError(res, 400, err.message); }
});

// ── GET /api/accounting/vouchers — history of manually-entered vouchers ────────
router.get('/vouchers', authenticate, requirePermission('accounts'), requireValidBranch, async (req, res) => {
  const tenantId = req.user.tenantId;
  const { from, to, sourceType, page = 1, limit = 30 } = req.query;
  try {
    let qb = db('tbl_accounting_journal').where({ Tenant_ID: tenantId }).whereIn('Source_Type', ['RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL']);
    qb = withBranch(qb, req);
    if (from) qb = qb.where('Entry_Date', '>=', from);
    if (to) qb = qb.where('Entry_Date', '<=', to);
    if (sourceType) qb = qb.where('Source_Type', sourceType);
    const total = await qb.clone().count('Journal_ID as c').first();
    const journals = await qb.orderBy('Entry_Date', 'desc').orderBy('Journal_ID', 'desc')
      .limit(parseInt(limit)).offset((parseInt(page) - 1) * parseInt(limit));
    const entries = await db('tbl_accounting_entries').whereIn('Journal_ID', journals.map((j) => j.Journal_ID));
    const byJournal = {};
    for (const e of entries) (byJournal[e.Journal_ID] = byJournal[e.Journal_ID] || []).push(e);
    const rows = journals.map((j) => ({ ...j, entries: byJournal[j.Journal_ID] || [] }));
    return sendSuccess(res, { items: rows, total: parseInt(total.c) });
  } catch (err) { return sendError(res, 500, 'Failed to fetch vouchers.'); }
});

// ── POST /api/accounting/voucher/:id/reverse — void a manual voucher SAFELY ────
// Never a hard delete of a posted entry — per the design doc's own
// principle ("reverse + re-enter rather than silently changing historical
// entries"), this posts an equal-and-opposite journal referencing the
// original, so both the mistake and its correction stay in the audit trail.
router.post('/voucher/:id/reverse', authenticate, requirePermission('accounts'), async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    const original = await db('tbl_accounting_journal').where({ Journal_ID: req.params.id, Tenant_ID: tenantId }).first();
    if (!original) return sendError(res, 404, 'Voucher not found.');
    if (!['RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL'].includes(original.Source_Type)) {
      return sendError(res, 400, 'Only manually-entered vouchers can be reversed here — Sales/Purchase have their own return/cancellation flow.');
    }
    const existingReversal = await db('tbl_accounting_journal').where({ Tenant_ID: tenantId, Source_Type: 'JOURNAL', Reference: `REVERSAL-${original.Journal_Number}` }).first();
    if (existingReversal) return sendError(res, 400, 'This voucher has already been reversed.');

    const originalEntries = await db('tbl_accounting_entries').where({ Journal_ID: original.Journal_ID });
    const { journalId, journalNumber } = await postJournal({
      tenantId, sourceType: 'JOURNAL', reference: `REVERSAL-${original.Journal_Number}`, branchId: original.Branch_ID,
      narration: `Reversal of ${original.Journal_Number}${original.Narration ? ' — ' + original.Narration : ''}`,
      createdBy: req.user.username,
      // Flip every line: what was Dr becomes Cr and vice versa — the exact opposite of the original, so together they net to zero.
      lines: originalEntries.map((e) => ({ account: e.Ledger_Account, type: e.Entry_Type === 'Dr' ? 'Cr' : 'Dr', amount: parseFloat(e.Amount) })),
    });
    return sendSuccess(res, { journalId, journalNumber }, `Reversed ${original.Journal_Number}.`, 201);
  } catch (err) { return sendError(res, 400, err.message); }
});

module.exports = router;
