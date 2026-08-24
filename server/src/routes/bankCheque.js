const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { postJournal } = require('../utils/accountingEngine');
const dayjs = require('dayjs');

// ── Bank Accounts ──────────────────────────────────────────────────────────────
router.get('/accounts', authenticate, async (req, res) => {
  try { return sendSuccess(res, await db('tbl_bank_account_master').where('Tenant_ID', req.user.tenantId).where('Is_Active', true)); }
  catch (err) { return sendError(res, 500, 'Failed to fetch bank accounts.'); }
});

router.post('/accounts', authenticate, [body('Bank_Name').notEmpty(), body('Account_Number').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const tenantId = req.user.tenantId;
    const openingBalance = parseFloat(req.body.Opening_Balance || 0);

    // Current_Balance starts at 0 here, NOT the opening balance — if there
    // is one, it's applied a few lines down through a real postJournal()
    // call instead, so it actually lands via the same Dr/Cr mechanism
    // every other posting uses (this ALSO increments Current_Balance, via
    // accountingEngine.js's bank-balance sync — see the comment below on
    // why a plain static field here would silently break Trial Balance).
    const [row] = await db('tbl_bank_account_master').insert({
      ...req.body, Tenant_ID: tenantId, Opening_Balance: openingBalance, Current_Balance: 0,
      Created_By: req.user.username,
    }).returning('*');

    // Every real bank gets its own Chart of Accounts ledger — the same
    // seeding the migration did for banks that already existed when the
    // accounting engine was built. Without this, a bank added from today
    // onward would never get the auto-synced Current_Balance the engine
    // gives every OTHER bank (see utils/accountingEngine.js), and any
    // payment posted against it would just silently create a generic,
    // disconnected ledger account instead of a real linked one.
    const label = `${row.Bank_Name} (${row.Account_Number})`;
    const existingCoa = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Account_Name: label }).first();
    if (!existingCoa) {
      const lastBankCode = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Account_Sub_Group: 'Bank' }).orderBy('Account_Code', 'desc').first();
      const nextCode = lastBankCode ? String(parseInt(lastBankCode.Account_Code) + 1) : '1050';
      await db('tbl_chart_of_accounts').insert({
        Tenant_ID: tenantId, Account_Code: nextCode, Account_Name: label,
        Account_Group: 'Assets', Account_Sub_Group: 'Bank',
        Is_Bank_Account: true, Bank_Account_ID: row.Account_ID,
        // Opening_Balance is deliberately NOT set here (stays the column
        // default of 0) — see the postJournal() call below.
        Is_System: true, Created_By: req.user.username,
      });
    }

    // A non-zero opening balance used to just sit in a static field that
    // Trial Balance/Ledger/Balance Sheet all read as a silent addition on
    // the Dr side, with nothing ever posted to the Cr side — an invisible
    // violation of the one rule the whole accounting engine exists to
    // enforce (Dr must always equal Cr). Found via a real, confirmed case:
    // a production tenant's bank account had exactly this problem. Post a
    // REAL journal instead — Dr the new bank, Cr Owner Capital Account —
    // so the balance is correct AND there's an actual audit-trail entry
    // explaining where it came from, same as everything else in the ledger.
    if (openingBalance > 0) {
      await postJournal({
        tenantId, sourceType: 'JOURNAL', reference: `OPENING-${row.Account_ID}`,
        narration: `Opening balance — ${label}`, createdBy: req.user.username,
        lines: [
          { account: label, group: 'Assets', sub: 'Bank', type: 'Dr', amount: openingBalance },
          { account: 'Owner Capital Account', group: 'Capital', sub: 'Capital', type: 'Cr', amount: openingBalance },
        ],
      }).catch((err) => console.error('[BankCheque] Opening balance journal failed (account still created fine):', err.message));
    }

    return sendSuccess(res, row, 'Bank account added.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to add bank account.'); }
});

// ── Cheque Register ────────────────────────────────────────────────────────────
router.get('/cheques', authenticate, async (req, res) => {
  const { status, type } = req.query;
  try {
    let qb = db('tbl_cheque_register as c')
      .leftJoin('tbl_bank_account_master as b', 'c.Account_ID', 'b.Account_ID')
      .where('c.Tenant_ID', req.user.tenantId)
      .select('c.*', 'b.Bank_Name as Own_Bank_Name');
    if (status) qb = qb.where('c.Status', status);
    if (type) qb = qb.where('c.Cheque_Type', type);
    return sendSuccess(res, await qb.orderBy('c.Cheque_Date', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch cheques.'); }
});

router.post('/cheques', authenticate, [
  body('Cheque_Type').isIn(['Received', 'Issued']),
  body('Party_Name').notEmpty(),
  body('Cheque_Number').notEmpty(),
  body('Amount').isFloat({ gt: 0 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_cheque_register').insert({ ...req.body, Tenant_ID: req.user.tenantId, Status: 'Pending', Created_By: req.user.username }).returning('*');
    return sendSuccess(res, row, 'Cheque logged.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to log cheque.'); }
});

router.post('/cheques/:id/deposit', authenticate, async (req, res) => {
  try {
    const [row] = await db('tbl_cheque_register').where({ Cheque_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: 'Deposited', Deposit_Date: dayjs().format('YYYY-MM-DD') }).returning('*');
    if (!row) return sendError(res, 404, 'Cheque not found.');
    return sendSuccess(res, row, 'Cheque marked deposited.');
  } catch (err) { return sendError(res, 500, 'Failed to update cheque.'); }
});

// POST /:id/clear and /:id/bounce both settle a cheque and, when it's a
// Received cheque, adjust the receiving bank account's running balance —
// an Issued cheque doesn't move our own balance until it clears against
// whatever the counterparty's bank does, which this register doesn't track.
router.post('/cheques/:id/clear', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    const cheque = await db('tbl_cheque_register').where({ Cheque_ID: req.params.id, Tenant_ID: tenantId }).first();
    if (!cheque) return sendError(res, 404, 'Cheque not found.');
    const [row] = await db('tbl_cheque_register').where('Cheque_ID', cheque.Cheque_ID)
      .update({ Status: 'Cleared', Clearing_Date: dayjs().format('YYYY-MM-DD'), Modified_Date: new Date() }).returning('*');
    if (cheque.Cheque_Type === 'Received' && cheque.Account_ID) {
      // Used to be a bare Current_Balance increment here with nothing
      // ever touching the actual double-entry ledger — the cheque's money
      // sat in "Cheque In Hand Account" since the sale/receipt that logged
      // it, and clearing should move it from there into THIS specific
      // bank. postJournal() below does both at once: it posts the real
      // Dr/Cr entry AND syncs Current_Balance itself (accountingEngine.js's
      // bank-balance sync) — do NOT also increment it here directly, or
      // it silently double-counts every cleared cheque's amount.
      const bank = await db('tbl_bank_account_master').where('Account_ID', cheque.Account_ID).first();
      const label = `${bank.Bank_Name} (${bank.Account_Number})`;
      await postJournal({
        tenantId, sourceType: 'JOURNAL', reference: `CHQCLR-${cheque.Cheque_ID}`,
        narration: `Cheque ${cheque.Cheque_Number} cleared — ${cheque.Party_Name}`, createdBy: req.user.username,
        lines: [
          { account: label, group: 'Assets', sub: 'Bank', type: 'Dr', amount: parseFloat(cheque.Amount) },
          { account: 'Cheque In Hand Account', group: 'Assets', sub: 'Bank', type: 'Cr', amount: parseFloat(cheque.Amount) },
        ],
      }).catch((err) => console.error('[BankCheque] Cheque-clear ledger post failed (cheque still cleared fine):', err.message));
    }
    return sendSuccess(res, row, 'Cheque cleared.');
  } catch (err) { return sendError(res, 500, 'Failed to clear cheque.'); }
});

router.post('/cheques/:id/bounce', authenticate, [body('Bounce_Charge').optional().isFloat({ min: 0 })], async (req, res) => {
  try {
    const [row] = await db('tbl_cheque_register').where({ Cheque_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: 'Bounced', Bounce_Charge: req.body.Bounce_Charge || 0, Modified_Date: new Date() }).returning('*');
    if (!row) return sendError(res, 404, 'Cheque not found.');
    return sendSuccess(res, row, 'Cheque marked bounced.');
  } catch (err) { return sendError(res, 500, 'Failed to update cheque.'); }
});

module.exports = router;
