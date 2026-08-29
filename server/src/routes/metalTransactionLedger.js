/**
 * Metal Transaction — a real opening/addition/issue/receipt/conversion/
 * closing ledger per metal type. Previously only existed as Pure Gold
 * Bin's single-entry holding record with a status flag (Holding ->
 * Disposed), no running balance, no addition/issue/receipt/conversion
 * distinction. This is the manual-entry side for movements that don't go
 * through Pure Gold Bin at all (e.g. a straight metal purchase, a melt
 * conversion) — Pure Gold Bin's own create/dispose actions also write
 * here (see binManagement.js) through the same appendMetalLedgerEntry().
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { isValidMetalType } = require('../utils/metalTypes');
const { appendMetalLedgerEntry } = require('../utils/metalLedger');

const TXN_TYPES = ['Opening', 'Addition', 'Issue', 'Receipt', 'Conversion', 'Closing'];
// Addition/Receipt/Opening bring metal IN (positive); Issue/Conversion
// take metal OUT (negative) — the sign is derived from type, not
// separately entered, so a mistaken sign can't silently corrupt the
// running balance.
const INCREASES_BALANCE = new Set(['Opening', 'Addition', 'Receipt']);

router.get('/', authenticate, async (req, res) => {
  try {
    const { metalType, fromDate, toDate } = req.query;
    let qb = db('tbl_metal_transaction_ledger').where({ Tenant_ID: req.user.tenantId });
    if (metalType) qb = qb.where('Metal_Type', metalType);
    if (fromDate) qb = qb.whereRaw('DATE("Created_Date") >= ?', [fromDate]);
    if (toDate) qb = qb.whereRaw('DATE("Created_Date") <= ?', [toDate]);
    return sendSuccess(res, await qb.orderBy('Ledger_ID', 'desc'));
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch metal ledger.');
  }
});

router.get('/balance', authenticate, async (req, res) => {
  try {
    // The latest row per metal already carries its own running total
    // (Balance_After) — no need to re-sum the whole table on every read.
    const rows = await db('tbl_metal_transaction_ledger as l')
      .where('l.Tenant_ID', req.user.tenantId)
      .whereRaw('l."Ledger_ID" = (SELECT MAX(l2."Ledger_ID") FROM tbl_metal_transaction_ledger l2 WHERE l2."Tenant_ID" = l."Tenant_ID" AND l2."Metal_Type" = l."Metal_Type")')
      .select('l.Metal_Type', 'l.Balance_After as Current_Balance', 'l.Created_Date as As_Of');
    return sendSuccess(res, rows);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch metal balances.');
  }
});

router.post('/', authenticate, [
  body('Transaction_Type').isIn(TXN_TYPES),
  body('Weight').isFloat({ gt: 0 }).withMessage('A positive weight is required — direction is derived from Transaction_Type'),
  body('Metal_Type').custom(async (value) => { if (!(await isValidMetalType(value))) throw new Error('Invalid metal type'); return true; }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const signedWeight = INCREASES_BALANCE.has(req.body.Transaction_Type) ? Math.abs(req.body.Weight) : -Math.abs(req.body.Weight);
    const row = await appendMetalLedgerEntry({
      tenantId: req.user.tenantId, branchId: req.body.Branch_ID, metalType: req.body.Metal_Type,
      transactionType: req.body.Transaction_Type, weightChange: signedWeight, purity: req.body.Purity,
      notes: req.body.Notes, createdBy: req.user.username,
    });
    return sendSuccess(res, row, 'Ledger entry recorded.', 201);
  } catch (err) {
    return sendError(res, 500, 'Failed to record ledger entry.');
  }
});

module.exports = router;
