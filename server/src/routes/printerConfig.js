/**
 * Printer configuration — which OS printer (as detected by the QZ Tray
 * bridge on the billing PC) is used for each document type. Matches the
 * Printer Setup & Document Printing Management spec's 9 document types
 * (§1/§7) — previously only 3 broad roles existed
 * (thermal_label/thermal_receipt/regular); Quotation, Purchase Bill,
 * Credit Note, Debit Note, and Reports all forcibly shared one printer.
 * See 20260906000000_expand_printer_roles_and_print_log.js for the
 * one-time rename of pre-existing config rows to these new role keys.
 *
 * Resolution priority (spec §19): Terminal -> Branch -> Tenant Default ->
 * System Default (the browser's own print dialog, once nothing here
 * matches at all — that's printService.js's fallbackPrint, not this file).
 * Terminal_ID is a specific computer/browser (see
 * client/src/utils/terminalIdentity.js) — a row scoped to one terminal is
 * invisible to every other computer, even at the same branch, per the
 * spec's "prevents the wrong computer from trying to print to another
 * workstation's printer."
 *
 * GET's resolution is deliberately plain JS over ALL of a tenant's rows
 * (a few dozen at most — 9 roles x a handful of branches/terminals),
 * rather than clever SQL ORDER BY/NULL-comparison tricks: two real bugs
 * were found in exactly that kind of logic in this file before (Postgres
 * sorts NULL first in DESC by default, and a missing WHERE NULL filter),
 * both caught by printerSetup.test.js. Plain JS priority comparison can't
 * have that class of bug.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');

const ROLES = ['quotation', 'sales_bill', 'purchase_bill', 'barcode', 'receipt', 'credit_note', 'debit_note', 'reports', 'other'];
// §4 — informational only (QZ Tray's printer list doesn't expose real
// connection-type data, confirmed in the original audit), an admin-set
// tag, never verified against anything live.
const CONNECTION_TYPES = ['USB', 'Network', 'WiFi', 'Bluetooth', 'Shared'];

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

router.get('/connection-types', authenticate, (req, res) => sendSuccess(res, CONNECTION_TYPES));

// ── GET /api/printer-config/terminals ─────────────────────────────────────────
// Every computer that has ever opened Printer Settings for this tenant —
// lets an admin see/rename/reassign-branch for each one (spec §18's
// "Terminal Configuration" admin view).
router.get('/terminals', authenticate, requirePermission('tenant_management'), async (req, res) => {
  try {
    const rows = await db('tbl_terminal_master')
      .where({ Tenant_ID: req.user.tenantId, Is_Active: true })
      .orderBy('Last_Seen_Date', 'desc');
    return sendSuccess(res, rows);
  } catch (err) { return sendError(res, 500, 'Failed to fetch terminals.'); }
});

// ── POST /api/printer-config/terminal ─────────────────────────────────────────
// Register-or-heartbeat for the CURRENT computer. terminalId is generated
// and persisted client-side (localStorage) — the server can't recognize
// "the same browser" across requests on its own. Called once when
// Printer Settings loads; a repeat call just touches Last_Seen_Date and
// only overwrites the name/branch if the caller actually sent a new one
// (never silently clobbers an admin-given name with a blank heartbeat).
router.post('/terminal', authenticate, [
  body('terminalId').trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const { terminalId, terminalName, branchId } = req.body;
  const tenantId = req.user.tenantId;
  try {
    const existing = await db('tbl_terminal_master').where({ Terminal_ID: terminalId, Tenant_ID: tenantId }).first();
    let row;
    if (existing) {
      const patch = { Last_Seen_Date: new Date(), Is_Active: true };
      if (terminalName) patch.Terminal_Name = terminalName;
      if (branchId !== undefined) patch.Branch_ID = branchId || null;
      [row] = await db('tbl_terminal_master').where({ Terminal_ID: terminalId }).update(patch).returning('*');
    } else {
      [row] = await db('tbl_terminal_master').insert({
        Terminal_ID: terminalId, Tenant_ID: tenantId, Branch_ID: branchId || null,
        Terminal_Name: terminalName || 'Unnamed Computer',
      }).returning('*');
    }
    return sendSuccess(res, row);
  } catch (err) {
    console.error('Terminal register error:', err.message);
    return sendError(res, 500, 'Failed to register this computer.');
  }
});

// ── PUT /api/printer-config/terminal/:terminalId ──────────────────────────────
// Admin-only rename/reassign/deactivate — distinct from the POST heartbeat
// above, which any authenticated user's browser calls automatically.
router.put('/terminal/:terminalId', authenticate, requirePermission('tenant_management'), async (req, res) => {
  const { terminalName, branchId, isActive } = req.body;
  try {
    const patch = {};
    if (terminalName !== undefined) patch.Terminal_Name = terminalName;
    if (branchId !== undefined) patch.Branch_ID = branchId || null;
    if (isActive !== undefined) patch.Is_Active = isActive;
    const [row] = await db('tbl_terminal_master')
      .where({ Terminal_ID: req.params.terminalId, Tenant_ID: req.user.tenantId })
      .update(patch).returning('*');
    if (!row) return sendError(res, 404, 'Terminal not found.');
    return sendSuccess(res, row);
  } catch (err) { return sendError(res, 500, 'Failed to update terminal.'); }
});

// ── GET /api/printer-config  ──────────────────────────────────────────────────
// Returns the tenant's configured printer for every role, resolved by
// priority: a Terminal_ID match beats a Branch_ID match beats a
// tenant-wide (both null) row. Pass terminalId and/or branchId as query
// params — omit either to skip that level of the cascade for this call.
router.get('/', authenticate, async (req, res) => {
  const { branchId, terminalId } = req.query;
  try {
    const allRows = await db('tbl_printer_config').where({ Tenant_ID: req.user.tenantId, Is_Active: true });

    // 3 = terminal-specific match, 2 = branch-specific match (and NOT
    // scoped to some other terminal), 1 = tenant-wide, 0 = not eligible
    // for this request at all (e.g. a different branch's row).
    const priorityOf = (r) => {
      if (terminalId && r.Terminal_ID === terminalId) return 3;
      if (branchId && r.Branch_ID === branchId && !r.Terminal_ID) return 2;
      if (!r.Branch_ID && !r.Terminal_ID) return 1;
      return 0;
    };

    const byRole = {};
    for (const r of allRows) {
      const p = priorityOf(r);
      if (p === 0) continue;
      const current = byRole[r.Printer_Role];
      if (!current || p > priorityOf(current)) byRole[r.Printer_Role] = r;
    }
    return sendSuccess(res, byRole);
  } catch (err) { return sendError(res, 500, 'Failed to fetch printer config.'); }
});

// ── PUT /api/printer-config  ──────────────────────────────────────────────────
// Upsert one role's printer assignment. Body: { role, printerName,
// branchId?, terminalId?, connectionType? }. branchId+terminalId together
// scope the row to "this document type, at this branch, on this specific
// computer" — the most specific level the cascade above supports.
router.put('/', authenticate, requirePermission('tenant_management'), [
  body('role').isIn(ROLES),
  body('printerName').trim().notEmpty(),
  body('connectionType').optional({ nullable: true }).isIn(CONNECTION_TYPES),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const { role, printerName, branchId, terminalId, connectionType } = req.body;
  const tenantId = req.user.tenantId;
  try {
    let qb = db('tbl_printer_config').where({ Tenant_ID: tenantId, Printer_Role: role });
    qb = branchId ? qb.where('Branch_ID', branchId) : qb.whereNull('Branch_ID');
    qb = terminalId ? qb.where('Terminal_ID', terminalId) : qb.whereNull('Terminal_ID');
    const existing = await qb.first();

    let row;
    if (existing) {
      [row] = await db('tbl_printer_config').where({ Config_ID: existing.Config_ID })
        .update({ Printer_Name: printerName, Connection_Type: connectionType || null, Is_Active: true, Updated_Date: new Date() })
        .returning('*');
    } else {
      [row] = await db('tbl_printer_config').insert({
        Tenant_ID: tenantId, Branch_ID: branchId || null, Terminal_ID: terminalId || null, Printer_Role: role,
        Printer_Name: printerName, Connection_Type: connectionType || null, Created_By: req.user.username,
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
