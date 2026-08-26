/**
 * Day Close, Gift Vouchers, Loyalty Points
 */
const router = require('express').Router();
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const dayjs = require('dayjs');
const crypto = require('crypto');
const { modeVal } = require('../utils/dataModeFilter');
const { postJournal } = require('../utils/accountingEngine');
const { requireValidBranch, branchVal, withBranch } = require('../utils/branchAccess');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Expected cash for a given tenant/branch/date, computed directly from the
// real ledger rather than a hand-rolled sum of "known" cash sources.
// Previously Cash_In_Hand was derived ONLY from cash sales — it ignored
// repair advances/deliveries, karigar settlements, purchase payments, and
// old-gold payouts, all of which move real cash and all of which the same
// ledger already records once posted through postJournal(). Reading the
// Cash Account ledger's own net movement for the day is correct by
// construction for EVERY cash-moving action, present or future, instead
// of a list that's easy to leave a source out of (which is exactly how
// this bug happened the first time).
async function computeExpectedCash(tid, dm, bId, date) {
  const prevClose = await db('tbl_day_close')
    .where({ Tenant_ID: tid, Branch_ID: bId, Status: 'Closed' })
    .where('Close_Date', '<', date)
    .orderBy('Close_Date', 'desc').first();
  const opening = prevClose ? parseFloat(prevClose.Verified_Cash || 0) : 0;

  let qb = db('tbl_accounting_entries as e')
    .join('tbl_accounting_journal as j', 'e.Journal_ID', 'j.Journal_ID')
    .where('e.Tenant_ID', tid).where('e.Ledger_Account', 'Cash Account')
    .where('j.Entry_Date', date).where('j.Data_Mode', dm);
  if (bId) qb = qb.where('j.Branch_ID', bId);
  const rows = await qb.select('e.Entry_Type').sum('e.Amount as total').groupBy('e.Entry_Type');
  let net = 0;
  for (const r of rows) net += (r.Entry_Type === 'Dr' ? 1 : -1) * parseFloat(r.total);

  return round2(opening + net);
}

// ── GET /api/day-close/today ────────────────────────────────────────────────────
// Multi-Branch Management §25/26 — tbl_day_close's schema already had a
// Branch_ID column AND a unique (Tenant_ID, Branch_ID, Close_Date) index
// from day one; this route just never used it, so every branch was
// silently sharing one tenant-wide "today" record. Now scoped by the
// active branch context — a branch-less request (no X-Branch-ID sent)
// keeps getting the old tenant-wide row, same as before this fix.
router.get('/today', authenticate, requireValidBranch, async (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const tid = req.user.tenantId;
  const dm  = modeVal(req);
  const bId = branchVal(req) === 'ALL' ? null : branchVal(req);
  try {
    let record = await db('tbl_day_close').where({ Tenant_ID: tid, Close_Date: today, Branch_ID: bId }).first().catch(() => null);

    // Sales/UPI/Card totals — display-only breakdown, sales-based (this
    // page's own summary cards). Cash_In_Hand itself is NOT derived from
    // this — see computeExpectedCash's own comment for why.
    let salesQb = db('tbl_sales_header')
      .where('Tenant_ID', tid)
      .where('Data_Mode', dm)
      .whereRaw(`DATE("Sale_Date") = ?`, [today])
      .whereNot('Payment_Status', 'Cancelled');
    salesQb = withBranch(salesQb, req);
    const [sales] = await salesQb.select(
        db.raw('COALESCE(SUM("Net_Payable_Amount"), 0) AS total_sales'),
        db.raw('COALESCE(SUM(CASE WHEN "Payment_Mode" = \'Cash\' THEN "Amount_Paid" ELSE 0 END), 0) AS cash_sales'),
        db.raw('COALESCE(SUM(CASE WHEN "Payment_Mode" = \'UPI\' THEN "Amount_Paid" ELSE 0 END), 0) AS upi_sales'),
        db.raw('COALESCE(SUM(CASE WHEN "Payment_Mode" IN (\'Card\',\'Debit Card\',\'Credit Card\') THEN "Amount_Paid" ELSE 0 END), 0) AS card_sales')
      );

    if (!record) {
      [record] = await db('tbl_day_close').insert({
        Tenant_ID: tid, Branch_ID: bId, Close_Date: today, Status: 'Open',
      }).returning('*').catch(() => [null]);
    }

    // Recomputed on every call while the day is still Open — this used to
    // only be set once, at auto-create time, and then never touched again;
    // a page left open since 10am showed a number that stopped moving,
    // and /close then used that stale figure as "expected cash." A
    // Closed day keeps its final recorded figures (Verified_Cash is the
    // number of record at that point, not a live one).
    const cashInHand = record?.Status === 'Closed' ? parseFloat(record.Cash_In_Hand || 0) : await computeExpectedCash(tid, dm, bId, today);

    return sendSuccess(res, {
      ...record,
      Total_Sales: sales.total_sales || 0, Cash_Sales: sales.cash_sales || 0,
      UPI_Sales: sales.upi_sales || 0, Card_Sales: sales.card_sales || 0,
      Cash_In_Hand: cashInHand,
    });
  } catch (err) { console.error(err); return sendError(res, 500, 'Failed.'); }
});

// ── POST /api/day-close/close ───────────────────────────────────────────────────
// Sales already post their own journal at creation time (sales.js) — Day
// Close's own accounting-relevant job is the two numbers THIS form
// collects that never reached the ledger before: cash actually spent
// during the day (Cash_Expenses), and any gap between what the ledger
// says cash should be and what was physically counted (Verified_Cash vs
// Cash_In_Hand). Without this, the ledger's Cash Account balance would
// silently drift from real physical cash every single day.
router.post('/close', authenticate, requireValidBranch, async (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const tid = req.user.tenantId;
  const dm = modeVal(req);
  // "Branch users should only be able to close their authorized branch" —
  // requireValidBranch already confirmed the caller has real access to
  // whatever branch (or 'ALL') their header claims; this route additionally
  // refuses to close under 'ALL' at all — closing the books is a specific
  // branch's (or, branch-less, the whole tenant's) action, never an
  // ambiguous "close everything" in one call.
  if (branchVal(req) === 'ALL') {
    return sendError(res, 400, 'Select a specific branch to close — "All Branches" cannot be closed as one action.');
  }
  const bId = branchVal(req);
  try {
    let existing = await db('tbl_day_close').where({ Tenant_ID: tid, Close_Date: today, Branch_ID: bId }).first();
    if (!existing) {
      // Used to be possible to close a day that GET /today had never been
      // called for — .update() then matched zero rows, `record` came back
      // undefined, and the route still returned "Day closed successfully."
      // with sourceId: undefined on the posted journals. Auto-create it
      // here instead of silently no-op'ing.
      [existing] = await db('tbl_day_close').insert({ Tenant_ID: tid, Branch_ID: bId, Close_Date: today, Status: 'Open' }).returning('*');
    }
    if (existing.Status === 'Closed') {
      return sendError(res, 400, `${today} is already closed for this branch.`);
    }

    const cashExpenses = parseFloat(req.body.cash_expenses || 0);
    const verifiedCash = parseFloat(req.body.verified_cash || 0);
    // Computed from the real ledger, not trusted from the client or a
    // stale stored value — see computeExpectedCash's own comment.
    const cashInHand = await computeExpectedCash(tid, dm, bId, today);
    // Expenses paid out of the till during the day reduce what SHOULD be
    // left in physical cash — comparing verifiedCash against cashInHand
    // alone (without subtracting expenses first) meant Cash Account got
    // credited TWICE for the same money: once by the expense journal
    // below, and again by a shortage journal that treated the entire
    // expense amount as an unexplained loss on top of it. A ₹5,000
    // expense day used to remove ₹10,000 from the ledger's cash balance.
    const expectedAfterExpenses = round2(cashInHand - cashExpenses);
    const difference = round2(verifiedCash - expectedAfterExpenses);

    const [record] = await db('tbl_day_close')
      .where({ Tenant_ID: tid, Close_Date: today, Branch_ID: bId })
      .update({
        Cash_In_Hand: cashInHand,
        Verified_Cash: verifiedCash,
        Difference: difference,
        Cash_Expenses: cashExpenses,
        Remarks: req.body.remarks,
        Status: 'Closed',
        Closed_By: req.user.userId,
        Closed_At: new Date(),
      }).returning('*');

    // Distinct reference per branch — two branches closing the same
    // calendar day used to generate the identical "DAYCLOSE-<date>"
    // reference string, which is exactly what shows as the Voucher Number
    // in the Tally export (routes/tally.js); Close_ID already made the
    // underlying journal traceable, but the human-facing reference didn't.
    const refSuffix = bId ? `-${bId}` : '';

    // Cash spent during the day — Dr the expense, Cr Cash (only a single
    // lump figure is collected today, no category breakdown, so it posts
    // as one generic "Other Expenses" line; a category-aware Day Close
    // form would let this split into real expense accounts instead).
    if (cashExpenses > 0) {
      // Awaited — was fire-and-forget, so the response could go out before
      // this journal was guaranteed committed (see sales.js's identical fix
      // for the concrete failure mode this caused: an export/report run
      // immediately after could miss the entry entirely).
      await postJournal({
        tenantId: tid, sourceType: 'DAY_CLOSE', sourceId: record?.Close_ID, reference: `DAYCLOSE-${today}${refSuffix}`, branchId: bId,
        narration: `Cash expenses on ${today}`, createdBy: req.user.username, dataMode: dm,
        lines: [
          { account: 'Other Expenses Account', group: 'Expenses', sub: 'Indirect Expense', type: 'Dr', amount: cashExpenses },
          { account: 'Cash Account', group: 'Assets', sub: 'Cash', type: 'Cr', amount: cashExpenses },
        ],
      }).catch((e) => console.warn('Day close cash-expense posting failed (non-fatal):', e.message));
    }

    // Physical cash count doesn't match the ledger — a real shortage or
    // excess, not something to silently ignore. Short: Dr the loss
    // (expense), Cr Cash (bring the ledger down to match reality). Excess:
    // Dr Cash (bring it up), Cr treated as other income. Two DISTINCT
    // account names, not one shared "Short/Excess" ledger — getOrCreateAccount
    // resolves by name only, so reusing one name for both directions would
    // lock in whichever group happened to post first and silently misfile
    // every entry going the other way.
    if (Math.abs(difference) > 0.01) {
      const isShort = difference < 0;
      // Awaited — see the cash-expenses fix just above for why.
      await postJournal({
        tenantId: tid, sourceType: 'DAY_CLOSE', sourceId: record?.Close_ID, reference: `DAYCLOSE-${today}${refSuffix}-DIFF`, branchId: bId,
        narration: `Cash ${isShort ? 'shortage' : 'excess'} found at day close ${today}`, createdBy: req.user.username, dataMode: dm,
        lines: isShort ? [
          { account: 'Cash Shortage Account', group: 'Expenses', sub: 'Indirect Expense', type: 'Dr', amount: Math.abs(difference) },
          { account: 'Cash Account', group: 'Assets', sub: 'Cash', type: 'Cr', amount: Math.abs(difference) },
        ] : [
          { account: 'Cash Account', group: 'Assets', sub: 'Cash', type: 'Dr', amount: Math.abs(difference) },
          { account: 'Cash Excess Account', group: 'Income', sub: 'Indirect Income', type: 'Cr', amount: Math.abs(difference) },
        ],
      }).catch((e) => console.warn('Day close cash-difference posting failed (non-fatal):', e.message));
    }

    return sendSuccess(res, record, 'Day closed successfully.');
  } catch (err) { return sendError(res, 500, 'Day close failed.'); }
});

// ── GET /api/day-close/history ──────────────────────────────────────────────────
router.get('/history', authenticate, requireValidBranch, async (req, res) => {
  try {
    let qb = db('tbl_day_close').where('Tenant_ID', req.user.tenantId);
    qb = withBranch(qb, req);
    const records = await qb.orderBy('Close_Date', 'desc').limit(30);
    return sendSuccess(res, records);
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

// ════════════════════════════════════════════════════════════════════════
// GIFT VOUCHERS
// ════════════════════════════════════════════════════════════════════════
router.get('/vouchers', authenticate, async (req, res) => {
  try {
    const vouchers = await db('tbl_gift_vouchers as v')
      .leftJoin('tbl_customer_master as c', 'v.Issued_To_Customer_ID', 'c.Customer_ID')
      .where('v.Tenant_ID', req.user.tenantId)
      .select('v.*', 'c.Customer_Name', 'c.Mobile_1')
      .orderBy('v.Created_Date', 'desc');
    return sendSuccess(res, vouchers);
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

router.post('/vouchers/create', authenticate, async (req, res) => {
  const tid = req.user.tenantId;
  try {
    const code = `GV-${tid.replace('_','')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const [v] = await db('tbl_gift_vouchers').insert({
      Tenant_ID: tid,
      Voucher_Code: code,
      Voucher_Value: req.body.value,
      Balance_Amount: req.body.value,
      Issue_Date: new Date(),
      Expiry_Date: req.body.expiry_date || null,
      Issued_To_Customer_ID: req.body.customer_id || null,
      Status: 'Active',
      Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, v, `Gift voucher ${code} created.`, 201);
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

router.get('/vouchers/:code', authenticate, async (req, res) => {
  try {
    const v = await db('tbl_gift_vouchers')
      .where({ Tenant_ID: req.user.tenantId, Voucher_Code: req.params.code })
      .first();
    if (!v) return sendError(res, 404, 'Voucher not found.');
    if (v.Status !== 'Active') return sendError(res, 400, `Voucher is ${v.Status}.`);
    if (v.Expiry_Date && new Date(v.Expiry_Date) < new Date()) return sendError(res, 400, 'Voucher has expired.');
    return sendSuccess(res, v);
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

// ════════════════════════════════════════════════════════════════════════
// LOYALTY POINTS
// ════════════════════════════════════════════════════════════════════════
router.get('/loyalty/:customerId', authenticate, async (req, res) => {
  try {
    const transactions = await db('tbl_loyalty_transactions')
      .where({ Tenant_ID: req.user.tenantId, Customer_ID: req.params.customerId })
      .orderBy('Created_Date', 'desc')
      .limit(50);
    const [balance] = await db('tbl_loyalty_transactions')
      .where({ Tenant_ID: req.user.tenantId, Customer_ID: req.params.customerId })
      .orderBy('Created_Date', 'desc').limit(1);
    return sendSuccess(res, { transactions, balance: parseFloat(balance?.Running_Balance || 0) });
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

module.exports = router;
