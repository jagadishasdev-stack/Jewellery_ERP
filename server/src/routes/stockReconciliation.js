/**
 * Stock Reconciliation / physical count. Two-step by design: a count is
 * saved as a Draft (every item's variance fully visible, nothing touched
 * yet), and stock only changes on a separate, explicit "Apply" call —
 * never automatically the moment a count is entered. See the migration's
 * own comment for why this shape was chosen over a one-step auto-adjust.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');
const { requireValidBranch, withBranch, resolveBranchForInsert } = require('../utils/branchAccess');
const { auditLog } = require('../utils/auditLogger');
const { nextNumber } = require('../utils/numberFormat');

// ── GET /api/stock-reconciliation ──────────────────────────────────────────────
router.get('/', authenticate, requireValidBranch, async (req, res) => {
  try {
    const rows = await withBranch(db('tbl_stock_reconciliation')
      .where('Tenant_ID', req.user.tenantId), req)
      .orderBy('Recon_Date', 'desc');
    // Item counts + total variance, one cheap extra query rather than N+1.
    const ids = rows.map((r) => r.Recon_ID);
    const summaries = ids.length
      ? await db('tbl_stock_reconciliation_items').whereIn('Recon_ID', ids)
          .groupBy('Recon_ID')
          .select('Recon_ID', db.raw('COUNT(*) as item_count'), db.raw('SUM(ABS("Variance")) as total_abs_variance'))
      : [];
    const byId = Object.fromEntries(summaries.map((s) => [s.Recon_ID, s]));
    const withSummary = rows.map((r) => ({ ...r, item_count: parseInt(byId[r.Recon_ID]?.item_count || 0), total_abs_variance: parseInt(byId[r.Recon_ID]?.total_abs_variance || 0) }));
    return sendSuccess(res, withSummary);
  } catch (err) { return sendError(res, 500, 'Failed to fetch stock reconciliations.'); }
});

// ── GET /api/stock-reconciliation/:id ──────────────────────────────────────────
router.get('/:id', authenticate, requireValidBranch, async (req, res) => {
  try {
    const header = await db('tbl_stock_reconciliation').where({ Recon_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!header) return sendError(res, 404, 'Reconciliation not found.');
    const items = await db('tbl_stock_reconciliation_items as i')
      .join('tbl_ornament_master as o', 'i.Ornament_ID', 'o.Ornament_ID')
      .where('i.Recon_ID', req.params.id)
      .select('i.*', 'o.Article_Number');
    return sendSuccess(res, { header, items });
  } catch (err) { return sendError(res, 500, 'Failed to fetch reconciliation detail.'); }
});

// ── POST /api/stock-reconciliation/create ──────────────────────────────────────
router.post('/create', authenticate, requireValidBranch, requirePermission('inventory'), [
  body('Recon_Date').isISO8601().withMessage('Recon date required'),
  body('items').isArray({ min: 1 }).withMessage('At least one counted item is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const trx = await db.transaction();
  try {
    const tenantId = req.user.tenantId;
    const reconNumber = await nextNumber({ tenantId, table: 'tbl_stock_reconciliation', column: 'Recon_Number', prefix: 'RECON', padWidth: 5 });
    const branchId = resolveBranchForInsert(req, req.body.Branch_ID);

    const [header] = await trx('tbl_stock_reconciliation').insert({
      Tenant_ID: tenantId, Branch_ID: branchId, Recon_Number: reconNumber,
      Recon_Date: req.body.Recon_Date, Notes: req.body.Notes || null,
      Status: 'Draft', Created_By: req.user.username,
    }).returning('*');

    const itemRows = [];
    for (const it of req.body.items) {
      const ornament = await trx('tbl_ornament_master').where({ Ornament_ID: it.Ornament_ID, Tenant_ID: tenantId }).first();
      if (!ornament) { await trx.rollback(); return sendError(res, 400, `Ornament ${it.Ornament_ID} not found for this tenant.`); }
      const counted = parseInt(it.Counted_Quantity, 10);
      if (!Number.isFinite(counted) || counted < 0) { await trx.rollback(); return sendError(res, 400, `Invalid counted quantity for ornament ${it.Ornament_ID}.`); }
      itemRows.push({
        Recon_ID: header.Recon_ID, Ornament_ID: it.Ornament_ID,
        System_Quantity: ornament.Stock_Quantity, Counted_Quantity: counted,
        Variance: counted - ornament.Stock_Quantity, Remarks: it.Remarks || null,
      });
    }
    const items = await trx('tbl_stock_reconciliation_items').insert(itemRows).returning('*');
    await trx.commit();

    await auditLog({ tenantId, userId: req.user.userId, tableName: 'tbl_stock_reconciliation', recordId: header.Recon_ID, actionType: 'INSERT', newData: header, description: `Stock reconciliation ${reconNumber} created (Draft) — ${items.length} items counted`, req });

    return sendSuccess(res, { header, items }, `Reconciliation ${reconNumber} saved as Draft.`, 201);
  } catch (err) {
    await trx.rollback();
    return sendError(res, 500, 'Failed to create reconciliation.');
  }
});

// ── POST /api/stock-reconciliation/:id/apply ───────────────────────────────────
// The only place stock quantities actually change — a deliberate, separate,
// explicit step from creating the count itself (see file header comment).
router.post('/:id/apply', authenticate, requireValidBranch, requirePermission('inventory'), async (req, res) => {
  const trx = await db.transaction();
  try {
    const tenantId = req.user.tenantId;
    const header = await trx('tbl_stock_reconciliation').where({ Recon_ID: req.params.id, Tenant_ID: tenantId }).first();
    if (!header) { await trx.rollback(); return sendError(res, 404, 'Reconciliation not found.'); }
    if (header.Status === 'Applied') { await trx.rollback(); return sendError(res, 400, 'This reconciliation has already been applied — it cannot be applied twice.'); }

    const items = await trx('tbl_stock_reconciliation_items').where('Recon_ID', req.params.id);
    for (const item of items) {
      if (item.Variance === 0) continue; // no real change — skip, don't touch the row for nothing
      await trx('tbl_ornament_master').where({ Ornament_ID: item.Ornament_ID, Tenant_ID: tenantId }).update({ Stock_Quantity: item.Counted_Quantity });
    }

    const [updated] = await trx('tbl_stock_reconciliation').where('Recon_ID', req.params.id)
      .update({ Status: 'Applied', Applied_By: req.user.username, Applied_Date: db.fn.now() }).returning('*');
    await trx.commit();

    const adjustedCount = items.filter((i) => i.Variance !== 0).length;
    await auditLog({ tenantId, userId: req.user.userId, tableName: 'tbl_stock_reconciliation', recordId: updated.Recon_ID, actionType: 'UPDATE', newData: updated, description: `Stock reconciliation ${header.Recon_Number} applied — ${adjustedCount} item(s) adjusted to counted quantity`, req });

    return sendSuccess(res, updated, `Applied — ${adjustedCount} item(s) adjusted.`);
  } catch (err) {
    await trx.rollback();
    return sendError(res, 500, 'Failed to apply reconciliation.');
  }
});

module.exports = router;
