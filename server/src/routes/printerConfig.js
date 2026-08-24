/**
 * Printer configuration — which OS printer (as detected by the QZ Tray
 * bridge on the billing PC) is used for each print-job role:
 *   thermal_label   — barcode/RFID tag printing
 *   thermal_receipt — POS receipt printing
 *   regular         — bills/invoices/reports on a normal printer (Epson etc.)
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');

const ROLES = ['thermal_label', 'thermal_receipt', 'regular'];

// ── GET /api/printer-config  ──────────────────────────────────────────────────
// Returns the tenant's configured printer for every role (branch-specific
// config wins over tenant-wide when both exist).
router.get('/', authenticate, async (req, res) => {
  const { branchId } = req.query;
  try {
    const rows = await db('tbl_printer_config')
      .where({ Tenant_ID: req.user.tenantId, Is_Active: true })
      .modify((qb) => {
        if (branchId) qb.where((b) => b.where('Branch_ID', branchId).orWhereNull('Branch_ID'));
      })
      .orderBy('Branch_ID', 'desc'); // non-null (branch-specific) rows first

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
