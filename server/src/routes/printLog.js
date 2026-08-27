/**
 * Print History (spec §23) — every actual print attempt (including a Test
 * Print) gets one row here: which document, which printer, which user,
 * when, and whether it actually succeeded. This is what answers "my bill
 * was not printed" — the admin can check whether the ERP actually sent
 * the print job, not just whether the sale itself saved.
 *
 * Printing itself always happens client-side (QZ Tray runs in the
 * browser/on the billing PC, the server is never in the print data
 * path) — this route only records the outcome the client already knows,
 * it never issues the print job itself.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { withBranch, requireValidBranch } = require('../utils/branchAccess');

// ── POST /api/print-log ────────────────────────────────────────────────────────
router.post('/', authenticate, [
  body('printerRole').trim().notEmpty(),
  body('printerName').trim().notEmpty(),
  body('status').isIn(['Success', 'Failed']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const { printerRole, documentType, documentNumber, printerName, status, errorMessage, branchId } = req.body;
  // Explicit body branchId wins; otherwise fall back to the request's own
  // X-Branch-ID context, but never store the literal 'ALL' as a Branch_ID.
  const resolvedBranchId = branchId || (req.branchId && req.branchId !== 'ALL' ? req.branchId : null);
  try {
    const [row] = await db('tbl_print_log').insert({
      Tenant_ID: req.user.tenantId,
      Branch_ID: resolvedBranchId,
      Printer_Role: printerRole,
      Document_Type: documentType || null,
      Document_Number: documentNumber || null,
      Printer_Name: printerName,
      Status: status,
      Error_Message: status === 'Failed' ? (errorMessage || null) : null,
      Printed_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, row);
  } catch (err) {
    // Logging a print attempt must never be the reason a real print (or
    // the sale it belongs to) appears to fail — swallow and report ok:false
    // rather than sendError, so a flaky log write can't confuse the caller
    // into thinking the actual print job failed.
    console.error('Print log write failed:', err.message);
    return sendSuccess(res, { logged: false });
  }
});

// ── GET /api/print-log ─────────────────────────────────────────────────────────
router.get('/', authenticate, requireValidBranch, async (req, res) => {
  const { fromDate, toDate, status, documentType, page = 1, limit = 50 } = req.query;
  try {
    let qb = withBranch(db('tbl_print_log').where({ Tenant_ID: req.user.tenantId }), req);
    if (fromDate) qb = qb.whereRaw(`DATE("Printed_Date") >= ?`, [fromDate]);
    if (toDate) qb = qb.whereRaw(`DATE("Printed_Date") <= ?`, [toDate]);
    if (status) qb = qb.where('Status', status);
    if (documentType) qb = qb.where('Document_Type', documentType);
    const [{ count }] = await qb.clone().count('Log_ID as count');
    const rows = await qb.clone().orderBy('Printed_Date', 'desc').limit(parseInt(limit)).offset((parseInt(page) - 1) * parseInt(limit));
    return sendSuccess(res, { items: rows, total: parseInt(count) });
  } catch (err) {
    console.error('Print log fetch failed:', err.message);
    return sendError(res, 500, 'Failed to fetch print history.');
  }
});

module.exports = router;
