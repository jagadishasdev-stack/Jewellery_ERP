/**
 * Customer Advance — a real, per-customer, lookupable advance ledger.
 * Purchase Hub's Advance Receipt / Advance Adjustment cards only ever
 * printed a paper receipt (no API call at all); binManagement.js's own
 * order-tied advance posts to the shared "Customer Advance Account" GL
 * account but has no per-customer subledger, so there was never a way to
 * answer "how much unapplied advance does this customer have" or apply
 * it to a bill created later. This route is that missing subledger.
 *
 * Applying an advance to a bill is FIFO across a customer's Active
 * advances (oldest first) — a customer doesn't think in terms of "which
 * specific receipt", just their one running balance; each original
 * receipt still keeps its own remaining balance and a per-application
 * audit row (tbl_customer_advance_application), so nothing is blended
 * into an untraceable pool.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');
const { modeVal } = require('../utils/dataModeFilter');
const { requireValidBranch, resolveBranchForInsert } = require('../utils/branchAccess');
const { postJournal } = require('../utils/accountingEngine');
const { resolveLedgerForPayment } = require('../utils/paymentLedgerMap');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── POST /api/customer-advance ─────────────────────────────────────────────────
router.post('/', authenticate, requireValidBranch, requirePermission('sales'), [
  body('Customer_ID').isInt().withMessage('Customer_ID required'),
  body('Amount').isFloat({ min: 1 }).withMessage('Amount required'),
  body('Payment_Mode').notEmpty().withMessage('Payment_Mode required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const tenantId = req.user.tenantId;
  try {
    const customer = await db('tbl_customer_master').where({ Customer_ID: req.body.Customer_ID, Tenant_ID: tenantId }).first();
    if (!customer) return sendError(res, 404, 'Customer not found.');

    const amount = round2(parseFloat(req.body.Amount));
    const receiptNumber = `ADV-${tenantId.replace('_', '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const branchId = resolveBranchForInsert(req, req.body.Branch_ID);

    const [advance] = await db('tbl_customer_advance').insert({
      Tenant_ID: tenantId, Branch_ID: branchId, Customer_ID: req.body.Customer_ID,
      Amount: amount, Balance_Amount: amount, Payment_Mode: req.body.Payment_Mode,
      Reference: receiptNumber, Purpose: req.body.Purpose || null, Status: 'Active',
      Created_By: req.user.username,
    }).returning('*');

    const ledger = await resolveLedgerForPayment(db, tenantId, req.body.Payment_Mode, req.body.Bank_Account_ID);
    await postJournal({
      tenantId, sourceType: 'CUSTOMER_ADVANCE', sourceId: advance.Advance_ID, reference: receiptNumber, branchId,
      narration: `Advance received | ${customer.Customer_Name} | ${req.body.Purpose || 'Advance'}`,
      lines: [
        { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Dr', amount },
        { account: 'Customer Advance Account', group: 'Liabilities', sub: 'Advance', type: 'Cr', amount },
      ],
      createdBy: req.user.username, dataMode: modeVal(req),
    });

    return sendSuccess(res, advance, `Advance ${receiptNumber} recorded.`, 201);
  } catch (err) {
    console.error('Customer advance create error:', err);
    return sendError(res, 500, 'Failed to record advance.');
  }
});

// ── GET /api/customer-advance/balance/:customerId ──────────────────────────────
// Total unapplied advance + the individual receipts behind it.
router.get('/balance/:customerId', authenticate, async (req, res) => {
  try {
    const rows = await db('tbl_customer_advance')
      .where({ Tenant_ID: req.user.tenantId, Customer_ID: req.params.customerId, Status: 'Active' })
      .andWhere('Balance_Amount', '>', 0)
      .orderBy('Created_Date', 'asc');
    const total = round2(rows.reduce((s, r) => s + parseFloat(r.Balance_Amount), 0));
    return sendSuccess(res, { total_available: total, advances: rows });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch advance balance.');
  }
});

// ── POST /api/customer-advance/:customerId/apply ────────────────────────────────
// Applies up to Amount of this customer's available advance against a real
// bill — settles its outstanding balance first, same convention as
// savingsScheme.js's adjust-invoice; if the invoice is already fully paid
// (or the advance exceeds what's owed), the remainder is a real refund.
router.post('/:customerId/apply', authenticate, requirePermission('sales'), [
  body('Invoice_Number').notEmpty().withMessage('Invoice_Number required'),
  body('Amount').isFloat({ min: 0.01 }).withMessage('Amount required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const tenantId = req.user.tenantId;
  const amount = round2(parseFloat(req.body.Amount));
  const trx = await db.transaction();
  try {
    const customer = await trx('tbl_customer_master').where({ Customer_ID: req.params.customerId, Tenant_ID: tenantId }).first();
    if (!customer) { await trx.rollback(); return sendError(res, 404, 'Customer not found.'); }

    const sale = await trx('tbl_sales_header').where({ Invoice_Number: req.body.Invoice_Number, Tenant_ID: tenantId }).forUpdate().first();
    if (!sale) { await trx.rollback(); return sendError(res, 404, `Invoice ${req.body.Invoice_Number} not found.`); }

    const advances = await trx('tbl_customer_advance')
      .where({ Tenant_ID: tenantId, Customer_ID: req.params.customerId, Status: 'Active' })
      .andWhere('Balance_Amount', '>', 0).orderBy('Created_Date', 'asc').forUpdate();
    const totalAvailable = round2(advances.reduce((s, a) => s + parseFloat(a.Balance_Amount), 0));
    if (amount > totalAvailable + 0.01) {
      await trx.rollback();
      return sendError(res, 400, `Amount (₹${amount.toFixed(2)}) exceeds this customer's available advance (₹${totalAvailable.toFixed(2)}).`);
    }

    // Draw down FIFO across the Active advances, recording an application
    // row per receipt actually touched.
    let remaining = amount;
    const applications = [];
    for (const adv of advances) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, parseFloat(adv.Balance_Amount));
      const newBalance = round2(parseFloat(adv.Balance_Amount) - take);
      await trx('tbl_customer_advance').where({ Advance_ID: adv.Advance_ID }).update({
        Balance_Amount: newBalance, Status: newBalance <= 0.01 ? 'Fully Applied' : 'Active', Modified_Date: new Date(),
      });
      applications.push({ Advance_ID: adv.Advance_ID, take });
      remaining = round2(remaining - take);
    }

    const currentBalanceOwed = Math.max(0, parseFloat(sale.Balance_Amount || 0));
    const appliedToInvoice = round2(Math.min(amount, currentBalanceOwed));
    const refundAmount = round2(amount - appliedToInvoice);

    if (appliedToInvoice > 0) {
      const newSaleBalance = round2(currentBalanceOwed - appliedToInvoice);
      await trx('tbl_sales_header').where('Sale_ID', sale.Sale_ID).update({
        Balance_Amount: newSaleBalance,
        Amount_Paid: round2(parseFloat(sale.Amount_Paid || 0) + appliedToInvoice),
        Payment_Status: newSaleBalance <= 0.01 ? 'Paid' : 'Partial',
      });
      await trx('tbl_sales_payments').insert({
        Sale_ID: sale.Sale_ID, Tenant_ID: tenantId, Payment_Mode: 'Customer Advance', Amount: appliedToInvoice,
        Reference: `Advance applied — ${customer.Customer_Name}`, Created_By: req.user.username, Data_Mode: modeVal(req),
      });
    }

    for (const app of applications) {
      await trx('tbl_customer_advance_application').insert({
        Tenant_ID: tenantId, Advance_ID: app.Advance_ID, Sale_ID: sale.Sale_ID, Invoice_Number: sale.Invoice_Number,
        Amount_Applied: app.take, Created_By: req.user.username,
      });
    }

    await trx.commit();

    // Post to the real ledger — awaited (same convention as every other
    // money-moving route in this codebase; see savingsScheme.js).
    await (async () => {
      const lines = [
        { account: 'Customer Advance Account', group: 'Liabilities', sub: 'Advance', type: 'Dr', amount },
      ];
      if (appliedToInvoice > 0) lines.push({ account: 'Customer Receivable Account', group: 'Assets', sub: 'Receivable', type: 'Cr', amount: appliedToInvoice });
      if (refundAmount > 0) {
        const payoutLedger = await resolveLedgerForPayment(db, tenantId, 'Cash');
        lines.push({ account: payoutLedger.account, group: payoutLedger.group, sub: payoutLedger.sub, type: 'Cr', amount: refundAmount });
      }
      await postJournal({
        tenantId, sourceType: 'CUSTOMER_ADVANCE', sourceId: sale.Sale_ID, reference: sale.Invoice_Number, branchId: sale.Branch_ID || null,
        narration: `Advance applied | ${customer.Customer_Name} | ${sale.Invoice_Number}`,
        lines, createdBy: req.user.username, dataMode: modeVal(req),
      });
    })().catch((err) => console.error('[CustomerAdvance] apply ledger post failed:', err.message));

    return sendSuccess(res, {
      applied_to_invoice: appliedToInvoice, refund_amount: refundAmount,
      invoice_balance_remaining: round2(currentBalanceOwed - appliedToInvoice),
    }, `₹${amount.toFixed(2)} advance applied to ${sale.Invoice_Number}.`, 201);
  } catch (err) {
    await trx.rollback();
    console.error('Customer advance apply error:', err);
    return sendError(res, 500, 'Failed to apply advance.');
  }
});

module.exports = router;
