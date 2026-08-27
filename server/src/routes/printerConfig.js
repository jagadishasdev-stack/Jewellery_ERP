/**
 * Printer configuration — which OS printer (as detected by the QZ Tray
 * bridge on the billing PC) is used for each document type. Matches the
 * Printer Setup & Document Printing Management spec's 9 document types
 * (§1/§7) — previously only 3 broad roles existed
 * (thermal_label/thermal_receipt/regular); Quotation, Purchase Bill,
 * Credit Note, Debit Note, and Reports all forcibly shared one printer.
 * See 20260906000000_expand_printer_roles_and_print_log.js for the
 * one-time rename of pre-existing config rows to these new role keys.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');

const ROLES = ['quotation', 'sales_bill', 'purchase_bill', 'barcode', 'receipt', 'credit_note', 'debit_note', 'reports', 'other'];

// Server-side source of truth for role labels/hints, so the client doesn't
// have to keep its own copy in sync — GET /roles below serves this.
const ROLE_META = {
  quotation:     { label: 'Quotation',              hint: 'Price quotations given to customers before a sale.' },
  sales_bill:    { label: 'Sales Bill / Invoice',    hint: 'The final tax invoice for a completed sale.' },
  purchase_bill: { label: 'Purchase Bill',           hint: 'Bills recorded for stock/gold purchased from suppliers.' },
  barcode:       { label: 'Barcode / RFID Label',    hint: 'Stock tag labels — usually a dedicated thermal barcode printer.' },
  receipt:       { label: 'Receipt',                 hint: 'POS receipts and payment/collection acknowledgements.' },
  credit_note:   { label: 'Credit Note',             hint: 'Issued to a customer for a sales return.' },
  debit_note:    { label: 'Debit Note',               hint: 'Issued to a supplier for a purchase return.' },
  reports:       { label: 'Reports',                  hint: 'Printed reports (day book, stock reports, etc).' },
  other:         { label: 'Other',                    hint: 'Everything else — approval vouchers, karigar slips, and any document with no more specific role above.' },
};

// ── GET /api/printer-config/roles ─────────────────────────────────────────────
// Static metadata (label/hint) for every role — lets the client render the
// assignment table without hardcoding its own copy of this list.
router.get('/roles', authenticate, (req, res) => {
  return sendSuccess(res, ROLES.map((key) => ({ key, ...ROLE_META[key] })));
});

// ── GET /api/printer-config  ──────────────────────────────────────────────────
// Returns the tenant's configured printer for every role (branch-specific
// config wins over tenant-wide when both exist).
router.get('/', authenticate, async (req, res) => {
  const { branchId } = req.query;
  try {
    const rows = await db('tbl_printer_config')
      .where({ Tenant_ID: req.user.tenantId, Is_Active: true })
      .modify((qb) => {
        // No branchId at all means "the whole business" (PrinterSettingsPage's
        // blank branch selector) — that must mean tenant-wide rows ONLY, not
        // "any row for any branch happens to sort first." Found via a real
        // test: with a branch-specific row present, an unscoped GET was
        // silently returning that branch's printer instead of the
        // tenant-wide default (or nothing, if no tenant-wide row existed).
        if (branchId) qb.where((b) => b.where('Branch_ID', branchId).orWhereNull('Branch_ID'));
        else qb.whereNull('Branch_ID');
      })
      // Postgres sorts NULL as "larger than any value" by default, which
      // means a plain `ORDER BY "Branch_ID" DESC` puts the NULL (tenant-wide)
      // row FIRST, not last — exactly backwards from "branch-specific wins."
      // Found via a real test (printerSetup.test.js) actually exercising
      // both a tenant-wide and a branch-specific row together, not caught
      // before since this route had no tests at all until this round.
      .orderByRaw('"Branch_ID" DESC NULLS LAST'); // non-null (branch-specific) rows first

    const byRole = {};
    rows.forEach((r) => { if (!byRole[r.Printer_Role]) byRole[r.Printer_Role] = r; });
    return sendSuccess(res, byRole);
  } catch (err) { return sendError(res, 500, 'Failed to fetch printer config.'); }
});

// ── PUT /api/printer-config  ──────────────────────────────────────────────────
// Upsert one role's printer assignment. Body: { role, printerName, branchId? }
router.put('/', authenticate, requirePermission('tenant_management'), [
  body('role').isIn(ROLES),
  body('printerName').trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const { role, printerName, branchId } = req.body;
  const tenantId = req.user.tenantId;
  try {
    let qb = db('tbl_printer_config').where({ Tenant_ID: tenantId, Printer_Role: role });
    qb = branchId ? qb.where('Branch_ID', branchId) : qb.whereNull('Branch_ID');
    const existing = await qb.first();

    let row;
    if (existing) {
      [row] = await db('tbl_printer_config').where({ Config_ID: existing.Config_ID })
        .update({ Printer_Name: printerName, Is_Active: true, Updated_Date: new Date() })
        .returning('*');
    } else {
      [row] = await db('tbl_printer_config').insert({
        Tenant_ID: tenantId, Branch_ID: branchId || null, Printer_Role: role,
        Printer_Name: printerName, Created_By: req.user.username,
      }).returning('*');
    }
    return sendSuccess(res, row, 'Printer assigned.');
  } catch (err) {
    console.error('Save printer config error:', err.message);
    return sendError(res, 500, 'Failed to save printer config.');
  }
});

module.exports = router;
module.exports.ROLES = ROLES;
