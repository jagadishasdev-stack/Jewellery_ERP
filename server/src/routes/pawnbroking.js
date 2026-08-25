const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../utils/auditLogger');
const { postJournal } = require('../utils/accountingEngine');
const { resolveLedgerForPayment } = require('../utils/paymentLedgerMap');
const { nextNumber } = require('../utils/numberFormat');
const dayjs = require('dayjs');

// tenantCode passed as the raw tenantId (not underscore-stripped) — this
// module never stripped it, unlike most other generators; kept as-is so
// switching to the shared helper doesn't change anyone's default output.
const genLoanNumber = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_pawn_loan_header', column: 'Loan_Number',
  prefix: 'PL', tenantCode: tenantId, padWidth: 4,
});

const genReceiptNumber = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_pawn_loan_transactions', column: 'Receipt_Number',
  prefix: 'PLR', tenantCode: tenantId, padWidth: 4,
});

// Interest owed since Interest_Paid_Upto_Date (or Loan_Date if never paid), on
// the current Principal_Outstanding — supports Monthly simple interest, the
// common case for gold-loan pawnbroking; Flat/Reducing loans still store a
// rate but this endpoint doesn't attempt day-count math for those schedules.
function calcInterestDue(loan, asOfDate = dayjs()) {
  const from = dayjs(loan.Interest_Paid_Upto_Date || loan.Loan_Date);
  const months = Math.max(0, asOfDate.diff(from, 'month', true));
  const principal = parseFloat(loan.Principal_Outstanding ?? loan.Loan_Amount);
  const rate = parseFloat(loan.Interest_Rate_Pct) / 100;
  return Math.round(principal * rate * months * 100) / 100;
}

// ── GET /api/pawnbroking/loans ────────────────────────────────────────────────
router.get('/loans', authenticate, async (req, res) => {
  const { status, customerId, page = 1, limit = 30 } = req.query;
  try {
    let qb = db('tbl_pawn_loan_header as l')
      .leftJoin('tbl_customer_master as c', 'l.Customer_ID', 'c.Customer_ID')
      .where('l.Tenant_ID', req.user.tenantId)
      .select('l.*', 'c.Customer_Name', 'c.Mobile_1');
    const countQb = db('tbl_pawn_loan_header').where('Tenant_ID', req.user.tenantId);
    if (status) { qb = qb.where('l.Status', status); countQb.where('Status', status); }
    if (customerId) { qb = qb.where('l.Customer_ID', customerId); countQb.where('Customer_ID', customerId); }
    const [{ count }] = await countQb.count('Loan_ID as count');
    const data = await qb.orderBy('l.Loan_Date', 'desc').limit(+limit).offset((+page - 1) * +limit);
    return sendSuccess(res, { items: data, total: parseInt(count) });
  } catch (err) { return sendError(res, 500, 'Failed to fetch pawn loans.'); }
});

// ── GET /api/pawnbroking/loans/:id ────────────────────────────────────────────
router.get('/loans/:id', authenticate, async (req, res) => {
  try {
    const loan = await db('tbl_pawn_loan_header').where({ Loan_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!loan) return sendError(res, 404, 'Loan not found.');
    const items = await db('tbl_pawn_loan_items').where('Loan_ID', loan.Loan_ID);
    const transactions = await db('tbl_pawn_loan_transactions').where('Loan_ID', loan.Loan_ID).orderBy('Txn_Date', 'desc');
    const guarantors = await db('tbl_pawn_loan_guarantor').where('Loan_ID', loan.Loan_ID);
    const interestDue = loan.Status === 'Active' ? calcInterestDue(loan) : 0;
    return sendSuccess(res, { ...loan, items, transactions, guarantors, interestDue });
  } catch (err) { return sendError(res, 500, 'Failed to fetch loan.'); }
});

// ── POST /api/pawnbroking/loans ───────────────────────────────────────────────
router.post('/loans', authenticate, [
  body('Customer_ID').notEmpty().withMessage('Customer is required'),
  body('Loan_Date').notEmpty().withMessage('Loan date is required'),
  body('Loan_Amount').isFloat({ gt: 0 }).withMessage('Loan amount must be greater than 0'),
  body('Interest_Rate_Pct').isFloat({ gt: 0 }).withMessage('Interest rate is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one pledged item is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const tenantId = req.user.tenantId;
  // Payment_Mode/Bank_Account_ID are how the loan was actually disbursed —
  // pulled out before building `header` since tbl_pawn_loan_header has no
  // such columns; they're consumed below by the ledger post only.
  const { items, guarantors, Appraised_Value, Payment_Mode, Bank_Account_ID, ...header } = req.body;
  try {
    const grossTotal = items.reduce((s, i) => s + parseFloat(i.Gross_Weight || 0), 0);
    const netTotal = items.reduce((s, i) => s + parseFloat(i.Net_Weight || 0), 0);
    const appraised = Appraised_Value ?? items.reduce((s, i) => s + parseFloat(i.Estimated_Value || 0), 0);

    const [loan] = await db('tbl_pawn_loan_header').insert({
      ...header,
      Tenant_ID: tenantId,
      Loan_Number: await genLoanNumber(tenantId),
      Total_Gross_Weight: grossTotal,
      Total_Net_Weight: netTotal,
      Appraised_Value: appraised,
      Principal_Outstanding: header.Loan_Amount,
      Interest_Paid_Upto_Date: header.Loan_Date,
      Due_Date: header.Due_Date || dayjs(header.Loan_Date).add(header.Tenure_Months || 12, 'month').format('YYYY-MM-DD'),
      Status: 'Active',
      Created_By: req.user.username,
    }).returning('*');

    await db('tbl_pawn_loan_items').insert(
      items.map((i) => ({ ...i, Loan_ID: loan.Loan_ID, Tenant_ID: tenantId, Item_Status: 'Pledged', Created_By: req.user.username }))
    );
    if (Array.isArray(guarantors) && guarantors.length) {
      await db('tbl_pawn_loan_guarantor').insert(guarantors.map((g) => ({ ...g, Loan_ID: loan.Loan_ID })));
    }

    // The loan amount is real cash/bank leaving the business the moment
    // it's disbursed — this used to post nothing at all. It's a real
    // asset (money owed back by the customer, secured by the pledge), not
    // an expense — Dr the receivable, Cr wherever the cash actually came from.
    const ledger = await resolveLedgerForPayment(db, tenantId, Payment_Mode || 'Cash', Bank_Account_ID);
    // Awaited — was fire-and-forget, so the response could go out before
    // this journal was guaranteed committed (see sales.js's identical fix
    // for the concrete failure mode: an export/report run immediately
    // after could otherwise miss the entry entirely).
    await postJournal({
      tenantId, sourceType: 'JOURNAL', sourceId: loan.Loan_ID, reference: loan.Loan_Number,
      narration: `Pawn loan disbursed — ${loan.Loan_Number}`, createdBy: req.user.username,
      lines: [
        { account: 'Pawn Loan Receivable Account', group: 'Assets', sub: 'Receivable', type: 'Dr', amount: parseFloat(loan.Loan_Amount) },
        { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Cr', amount: parseFloat(loan.Loan_Amount) },
      ],
    }).catch((e) => console.error('[Pawnbroking] Disbursement ledger post failed (loan still recorded fine):', e.message));

    await auditLog({ tenantId, userId: req.user.userId, tableName: 'tbl_pawn_loan_header', recordId: loan.Loan_ID, actionType: 'INSERT', newData: loan, description: `Pawn loan ${loan.Loan_Number} created for ₹${loan.Loan_Amount}`, req });
    return sendSuccess(res, loan, 'Pawn loan created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create pawn loan: ' + err.message); }
});

// ── POST /api/pawnbroking/loans/:id/transactions ──────────────────────────────
// Txn_Type: 'Interest Receipt' | 'Part Payment' | 'Redemption' | 'Auction' | 'Top-Up'
router.post('/loans/:id/transactions', authenticate, [
  body('Txn_Type').notEmpty(),
  body('Total_Amount').isFloat({ gt: 0 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const tenantId = req.user.tenantId;
  try {
    const loan = await db('tbl_pawn_loan_header').where({ Loan_ID: req.params.id, Tenant_ID: tenantId }).first();
    if (!loan) return sendError(res, 404, 'Loan not found.');
    if (loan.Status !== 'Active') return sendError(res, 400, `Loan is ${loan.Status}, no further transactions allowed.`);

    const { Txn_Type, Total_Amount, Payment_Mode, Remarks, Txn_Date } = req.body;
    const interestCollected = parseFloat(req.body.Interest_Collected || 0);
    const principalCollected = parseFloat(req.body.Principal_Collected || (Txn_Type === 'Part Payment' || Txn_Type === 'Redemption' ? Total_Amount - interestCollected : 0));
    const newOutstanding = Math.max(0, parseFloat(loan.Principal_Outstanding) - principalCollected);

    const [txn] = await db('tbl_pawn_loan_transactions').insert({
      Loan_ID: loan.Loan_ID, Tenant_ID: tenantId, Txn_Type, Txn_Date: Txn_Date || dayjs().format('YYYY-MM-DD'),
      Interest_Collected: interestCollected, Principal_Collected: principalCollected, Total_Amount,
      Balance_Due: newOutstanding, Payment_Mode, Remarks,
      Receipt_Number: await genReceiptNumber(tenantId), Created_By: req.user.username,
    }).returning('*');

    const headerUpdate = {
      Principal_Outstanding: newOutstanding,
      Interest_Paid_Upto_Amount: parseFloat(loan.Interest_Paid_Upto_Amount || 0) + interestCollected,
      Interest_Paid_Upto_Date: Txn_Date || dayjs().format('YYYY-MM-DD'),
      Modified_By: req.user.username,
    };
    if (Txn_Type === 'Redemption' || newOutstanding <= 0) {
      headerUpdate.Status = 'Redeemed';
      headerUpdate.Redeemed_Date = dayjs().format('YYYY-MM-DD');
      await db('tbl_pawn_loan_items').where('Loan_ID', loan.Loan_ID).update({ Item_Status: 'Returned', Returned_Date: dayjs().format('YYYY-MM-DD') });
    }
    const [updatedLoan] = await db('tbl_pawn_loan_header').where('Loan_ID', loan.Loan_ID).update(headerUpdate).returning('*');

    // This used to only move tbl_pawn_loan_header's own running balance —
    // real cash/bank collected from (or, for a Top-Up, paid back out to)
    // the customer, never touching the actual double-entry ledger.
    // Awaited (the IIFE itself, not just the postJournal call inside it) —
    // was fire-and-forget, same fix as the disbursement journal above.
    await (async () => {
      const ledger = await resolveLedgerForPayment(db, tenantId, Payment_Mode || 'Cash', req.body.Bank_Account_ID);
      const narration = `${Txn_Type} on loan ${loan.Loan_Number}${Remarks ? ' | ' + Remarks : ''}`;
      const lines = Txn_Type === 'Top-Up'
        // Note: Top-Up here only affects the ledger, not Principal_Outstanding
        // above — this endpoint's existing math doesn't increase the loan
        // balance for a Top-Up (a separate, pre-existing gap in the loan
        // business logic, not something this ledger fix attempts to solve).
        ? [
            { account: 'Pawn Loan Receivable Account', group: 'Assets', sub: 'Receivable', type: 'Dr', amount: parseFloat(Total_Amount) },
            { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Cr', amount: parseFloat(Total_Amount) },
          ]
        : [
            { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Dr', amount: parseFloat(Total_Amount) },
            ...(interestCollected > 0 ? [{ account: 'Pawn Interest Income Account', group: 'Income', sub: 'Direct Income', type: 'Cr', amount: interestCollected }] : []),
            ...(principalCollected > 0 ? [{ account: 'Pawn Loan Receivable Account', group: 'Assets', sub: 'Receivable', type: 'Cr', amount: principalCollected }] : []),
          ];
      await postJournal({
        tenantId, sourceType: 'JOURNAL', sourceId: txn.Txn_ID, reference: txn.Receipt_Number,
        narration, createdBy: req.user.username, lines,
      });
    })().catch((e) => console.error('[Pawnbroking] Transaction ledger post failed (transaction still recorded fine):', e.message));

    await auditLog({ tenantId, userId: req.user.userId, tableName: 'tbl_pawn_loan_transactions', recordId: txn.Txn_ID, actionType: 'INSERT', newData: txn, description: `${Txn_Type} of ₹${Total_Amount} on loan ${loan.Loan_Number}`, req });
    return sendSuccess(res, { transaction: txn, loan: updatedLoan }, 'Transaction recorded.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to record transaction: ' + err.message); }
});

// ── POST /api/pawnbroking/loans/:id/auction ───────────────────────────────────
router.post('/loans/:id/auction', authenticate, [body('Auction_Sale_Value').isFloat({ gt: 0 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const tenantId = req.user.tenantId;
  try {
    const existing = await db('tbl_pawn_loan_header').where({ Loan_ID: req.params.id, Tenant_ID: tenantId }).first();
    if (!existing) return sendError(res, 404, 'Loan not found.');
    const saleValue = parseFloat(req.body.Auction_Sale_Value);
    const outstanding = parseFloat(existing.Principal_Outstanding || 0);

    const [loan] = await db('tbl_pawn_loan_header')
      .where({ Loan_ID: req.params.id, Tenant_ID: tenantId })
      // The outstanding loan is genuinely settled the moment the pledge is
      // auctioned — Principal_Outstanding used to stay at its pre-auction
      // value forever, leaving a permanently "still owed" balance on a
      // loan the business will never collect from the customer directly.
      .update({ Status: 'Auctioned', Auctioned_Date: dayjs().format('YYYY-MM-DD'), Auction_Sale_Value: saleValue, Principal_Outstanding: 0, Modified_By: req.user.username })
      .returning('*');
    await db('tbl_pawn_loan_items').where('Loan_ID', loan.Loan_ID).update({ Item_Status: 'Auctioned' });

    // The auction proceeds are real cash — this used to post nothing.
    // Dr Cash for what was actually realized; Cr the receivable being
    // cleared (capped at what was actually outstanding). Any shortfall
    // (item sold for less than owed) is a real write-off; any surplus
    // (sold for more) is owed back to the customer under most pawnbroking
    // rules — kept as a payable rather than pocketed as income.
    const shortfall = Math.max(0, outstanding - saleValue);
    const surplus = Math.max(0, saleValue - outstanding);
    // The FULL outstanding receivable clears off the books here (it's
    // going to 0 either way) — shortfall/surplus is what reconciles that
    // against what was actually realized in cash, not a cap on how much
    // of the receivable gets cleared.
    const lines = [
      { account: 'Cash Account', group: 'Assets', sub: 'Cash', type: 'Dr', amount: saleValue },
      { account: 'Pawn Loan Receivable Account', group: 'Assets', sub: 'Receivable', type: 'Cr', amount: outstanding },
    ];
    if (shortfall > 0) lines.push({ account: 'Pawn Auction Shortfall Expense Account', group: 'Expenses', sub: 'Indirect Expense', type: 'Dr', amount: shortfall });
    if (surplus > 0) lines.push({ account: 'Auction Surplus Payable Account', group: 'Liabilities', sub: 'Payable', type: 'Cr', amount: surplus });
    // Awaited — same fire-and-forget fix as the disbursement/transaction
    // journals above.
    await postJournal({
      // Distinct from the disbursement journal's reference (which also
      // uses the bare Loan_Number) — otherwise two entirely different
      // postings for the same loan share one reference with no way to
      // tell them apart except by reading the narration text.
      tenantId, sourceType: 'JOURNAL', sourceId: loan.Loan_ID, reference: `${loan.Loan_Number}-AUCTION`,
      narration: `Pledge auctioned — ${loan.Loan_Number}`, createdBy: req.user.username, lines,
    }).catch((e) => console.error('[Pawnbroking] Auction ledger post failed (auction still recorded fine):', e.message));

    await auditLog({ tenantId, userId: req.user.userId, tableName: 'tbl_pawn_loan_header', recordId: loan.Loan_ID, actionType: 'UPDATE', newData: loan, description: `Loan ${loan.Loan_Number} auctioned for ₹${saleValue}`, req });
    return sendSuccess(res, loan, 'Loan marked as auctioned.');
  } catch (err) { return sendError(res, 500, 'Failed to record auction.'); }
});

// ── GET /api/pawnbroking/overdue ──────────────────────────────────────────────
router.get('/overdue', authenticate, async (req, res) => {
  try {
    const rows = await db('tbl_pawn_loan_header as l')
      .leftJoin('tbl_customer_master as c', 'l.Customer_ID', 'c.Customer_ID')
      .where('l.Tenant_ID', req.user.tenantId).where('l.Status', 'Active')
      .where('l.Due_Date', '<', dayjs().format('YYYY-MM-DD'))
      .select('l.*', 'c.Customer_Name', 'c.Mobile_1').orderBy('l.Due_Date', 'asc');
    return sendSuccess(res, rows.map((l) => ({ ...l, interestDue: calcInterestDue(l) })));
  } catch (err) { return sendError(res, 500, 'Failed to fetch overdue loans.'); }
});

module.exports = router;
