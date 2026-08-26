const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');
const { modeVal } = require('../utils/dataModeFilter');
const { generateTransferNumber } = require('../utils/invoiceNumber');
const { auditLog } = require('../utils/auditLogger');
const { getAllowedBranches, requireValidBranch, branchVal } = require('../utils/branchAccess');

// Multi-Branch Management (spec §14/26/28) — a Branch-type transfer must
// be authorized on BOTH ends independently: the sender needs access to
// the branch stock is leaving, the receiver needs access to the branch
// it's arriving at. This is deliberately separate from requireValidBranch/
// withBranch (the X-Branch-ID "which screen am I working in" context used
// elsewhere) — a transfer explicitly names its From/To branches in the
// request body, so the check is against THOSE specific branches, not
// whatever the caller's current header happens to say. Floor/Counter/Tray
// transfers (no branch crossing at all) are untouched by this — nothing
// here narrows who can move stock within their own branch.
const assertBranchAccess = async (req, branchId) => {
  if (!branchId) return true; // not a branch-crossing transfer
  const access = await getAllowedBranches(req);
  return access.allBranches || access.branchIds.includes(branchId);
};

// Resolves the ornaments affected by a hide/unhide request, based on level.
// hiddenState filters to only-visible (false, for hide) or only-hidden (true, for unhide) stock.
const resolveOrnamentIds = async (trx, tenantId, level, ids, hiddenState) => {
  let qb = trx('tbl_ornament_master')
    .where('Tenant_ID', tenantId).where('Is_Sold', false).where('Is_Active', true)
    .where('Is_Hidden', hiddenState);

  if (level === 'item') {
    qb = qb.whereIn('Ornament_ID', ids.map(Number));
  } else {
    const columnByLevel = { tray: 'Tray_ID', counter: 'Counter_ID', floor: 'Floor_ID' };
    const column = columnByLevel[level];
    if (!column) return [];
    qb = qb.whereIn(column, ids.map(Number));
  }

  return qb.select('Ornament_ID', 'Article_Number', 'Gross_Weight');
};

// ── GET /api/transfer  ────────────────────────────────────────────────────────
// requireValidBranch/withBranch — this had no branch scoping at all
// (found via audit), so a user restricted to one branch could see every
// OTHER branch's transfer history too. A transfer touches the active
// branch on either end (it's either sending stock out or receiving it
// in), so it matches on From_Branch_ID OR To_Branch_ID.
router.get('/', authenticate, requireValidBranch, async (req, res) => {
  const { status, page = 1, limit = 30 } = req.query;
  try {
    const applyBranchFilter = (qb, fromCol, toCol) => {
      const b = branchVal(req);
      if (!b || b === 'ALL') return qb;
      return qb.where((w) => w.where(fromCol, b).orWhere(toCol, b));
    };

    let qb = db('tbl_stock_transfer as tr')
      .leftJoin('tbl_branch_master as fb', 'tr.From_Branch_ID', 'fb.Branch_ID')
      .leftJoin('tbl_branch_master as tb', 'tr.To_Branch_ID', 'tb.Branch_ID')
      .where('tr.Tenant_ID', req.user.tenantId)
      .where('tr.Data_Mode', modeVal(req))
      .select('tr.*', 'fb.Branch_Name as From_Branch_Name', 'tb.Branch_Name as To_Branch_Name');
    qb = applyBranchFilter(qb, 'tr.From_Branch_ID', 'tr.To_Branch_ID');
    if (status) qb = qb.where('tr.Status', status);

    let countQb = db('tbl_stock_transfer').where('Tenant_ID', req.user.tenantId).where('Data_Mode', modeVal(req));
    countQb = applyBranchFilter(countQb, 'From_Branch_ID', 'To_Branch_ID');
    if (status) countQb.where('Status', status);
    const [{ count }] = await countQb.count('Transfer_ID as count');
    const data = await qb.orderBy('tr.Transfer_Date', 'desc')
      .limit(parseInt(limit)).offset((parseInt(page)-1)*parseInt(limit));
    return sendSuccess(res, { items: data, total: parseInt(count) });
  } catch (err) { return sendError(res, 500, 'Failed to fetch transfers.'); }
});

// ── POST /api/transfer/create  ────────────────────────────────────────────────
// requirePermission('inventory') — this had NO permission check at all
// (found via audit), so any logged-in user could move stock between
// branches. Real separation of duties still needs a manager on the
// RECEIVING end too (see /approve below) — a user with access to both
// branches could still create AND approve their own transfer, since
// nothing here requires a different person for that half.
router.post('/create', authenticate, requirePermission('inventory'), [
  body('Transfer_Type').isIn(['Floor','Branch','Counter','Tray']),
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  // Multi-Branch Management — you can only send stock OUT of a branch you
  // actually have access to. Checked before opening the transaction at
  // all, so an unauthorized attempt never touches the DB.
  if (!(await assertBranchAccess(req, req.body.From_Branch_ID))) {
    return sendError(res, 403, 'You do not have access to the source branch for this transfer.');
  }
  const trx = await db.transaction();
  try {
    const tenantId = req.user.tenantId;
    const transferNumber = await generateTransferNumber(tenantId);
    const [transfer] = await trx('tbl_stock_transfer').insert({
      Tenant_ID: tenantId,
      Transfer_Number: transferNumber,
      Transfer_Type: req.body.Transfer_Type,
      From_Branch_ID: req.body.From_Branch_ID || null,
      From_Floor_ID:  req.body.From_Floor_ID  || null,
      From_Counter_ID:req.body.From_Counter_ID|| null,
      From_Tray_ID:   req.body.From_Tray_ID   || null,
      To_Branch_ID:   req.body.To_Branch_ID   || null,
      To_Floor_ID:    req.body.To_Floor_ID    || null,
      To_Counter_ID:  req.body.To_Counter_ID  || null,
      To_Tray_ID:     req.body.To_Tray_ID     || null,
      Remarks: req.body.Remarks || null,
      Status: 'Pending',
      Data_Mode: modeVal(req),
      Created_By: req.user.username,
    }).returning('*');

    const items = req.body.items.map(i => ({
      Transfer_ID: transfer.Transfer_ID,
      Ornament_ID: i.Ornament_ID,
      Article_Number: i.Article_Number,
      Gross_Weight: i.Gross_Weight,
      Status: 'Pending',
    }));
    await trx('tbl_stock_transfer_items').insert(items);

    // Reserve the stock — between create and approve/reject, an item in
    // transit stayed Is_Stock_Available (sellable at the POS the whole
    // time), and approving afterwards moved a sold item's Branch_ID to
    // the destination (found via audit). Same flag approval.js already
    // correctly uses for goods-on-approval — this was the one place that
    // moved real stock without it.
    const ornamentIds = items.map((i) => i.Ornament_ID).filter(Boolean);
    if (ornamentIds.length > 0) {
      await trx('tbl_ornament_master').whereIn('Ornament_ID', ornamentIds).update({ Is_Stock_Available: false });
    }

    await trx.commit();
    return sendSuccess(res, transfer, 'Transfer initiated.', 201);
  } catch (err) {
    await trx.rollback();
    console.error('Transfer create error:', err);
    return sendError(res, 500, 'Failed to create transfer.');
  }
});

// ── POST /api/transfer/:id/approve  ──────────────────────────────────────────
router.post('/:id/approve', authenticate, requirePermission('inventory'), async (req, res) => {
  const trx = await db.transaction();
  try {
    // Tenant_ID was missing here entirely — Transfer_ID is a plain global
    // auto-increment, so any authenticated user of ANY tenant could
    // previously approve/view another tenant's transfer just by trying
    // sequential IDs. Found while adding the branch-level check below;
    // fixed alongside it since it's the exact same lookup.
    const transfer = await trx('tbl_stock_transfer').where({ Transfer_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!transfer) { await trx.rollback(); return sendError(res, 404, 'Transfer not found.'); }
    if (transfer.Status !== 'Pending') { await trx.rollback(); return sendError(res, 400, 'Transfer already processed.'); }
    // Multi-Branch Management — approving is the RECEIVING branch
    // confirming stock actually arrived; requires access to To_Branch_ID,
    // independent of who was allowed to create/send it.
    if (!(await assertBranchAccess(req, transfer.To_Branch_ID))) {
      await trx.rollback();
      return sendError(res, 403, 'You do not have access to the destination branch for this transfer.');
    }

    // Move ornaments to new location
    const items = await trx('tbl_stock_transfer_items').where({ Transfer_ID: req.params.id });
    const ornamentIds = items.map(i => i.Ornament_ID).filter(Boolean);

    if (ornamentIds.length > 0) {
      const updatePayload = {
        Branch_ID: transfer.To_Branch_ID || db.raw('"Branch_ID"'),
        Is_Stock_Available: true, // released from transit — reserved at /create above
        Last_Updated_By: req.user.username,
        Last_Updated_Date: new Date(),
      };
      // Only reassign the location fields the transfer actually targets — a Branch-only
      // transfer, for example, must not clobber the item's existing floor/counter/tray/note.
      if (req.body.newLocation) updatePayload.Physical_Location = req.body.newLocation;
      if (transfer.To_Floor_ID) updatePayload.Floor_ID = transfer.To_Floor_ID;
      if (transfer.To_Counter_ID) updatePayload.Counter_ID = transfer.To_Counter_ID;
      if (transfer.To_Tray_ID) updatePayload.Tray_ID = transfer.To_Tray_ID;

      await trx('tbl_ornament_master').whereIn('Ornament_ID', ornamentIds).update(updatePayload);
    }

    await trx('tbl_stock_transfer_items').where({ Transfer_ID: req.params.id }).update({ Status: 'Received' });
    await trx('tbl_stock_transfer').where({ Transfer_ID: req.params.id }).update({
      Status: 'Completed',
      Approved_By: req.user.username,
      Approved_Date: new Date(),
    });

    await trx.commit();

    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_stock_transfer',
      recordId: transfer.Transfer_ID, actionType: 'UPDATE',
      description: `Transfer ${transfer.Transfer_Number} approved by ${req.user.username} — ${ornamentIds.length} item(s) moved`,
      req,
    });

    return sendSuccess(res, null, `Transfer ${transfer.Transfer_Number} approved. ${ornamentIds.length} items moved.`);
  } catch (err) {
    await trx.rollback();
    console.error('Approve transfer error:', err);
    return sendError(res, 500, 'Failed to approve transfer.');
  }
});

// ── POST /api/transfer/:id/reject  ───────────────────────────────────────────
router.post('/:id/reject', authenticate, requirePermission('inventory'), async (req, res) => {
  try {
    // Same fixes as /approve just above: real Tenant_ID scoping (this
    // used to update blindly by ID alone, no existence check, no tenant
    // check at all) and the same destination-branch access requirement —
    // rejecting is still the receiving branch's call to make.
    const transfer = await db('tbl_stock_transfer').where({ Transfer_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!transfer) return sendError(res, 404, 'Transfer not found.');
    if (transfer.Status !== 'Pending') return sendError(res, 400, 'Transfer already processed.');
    if (!(await assertBranchAccess(req, transfer.To_Branch_ID))) {
      return sendError(res, 403, 'You do not have access to the destination branch for this transfer.');
    }

    await db('tbl_stock_transfer').where({ Transfer_ID: req.params.id }).update({ Status: 'Rejected', Approved_By: req.user.username });
    await db('tbl_stock_transfer_items').where({ Transfer_ID: req.params.id }).update({ Status: 'Rejected' });

    // Release the reservation from /create above — a rejected transfer
    // must not leave the stock permanently un-sellable at its own
    // (unchanged) branch.
    const items = await db('tbl_stock_transfer_items').where({ Transfer_ID: req.params.id });
    const ornamentIds = items.map((i) => i.Ornament_ID).filter(Boolean);
    if (ornamentIds.length > 0) {
      await db('tbl_ornament_master').whereIn('Ornament_ID', ornamentIds).update({ Is_Stock_Available: true });
    }

    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_stock_transfer',
      recordId: transfer.Transfer_ID, actionType: 'UPDATE',
      description: `Transfer ${transfer.Transfer_Number} rejected by ${req.user.username}`,
      req,
    });

    return sendSuccess(res, null, 'Transfer rejected.');
  } catch (err) { return sendError(res, 500, 'Failed to reject transfer.'); }
});

// ── POST /api/transfer/hide  ─────────────────────────────────────────────────
// Moves stock (by item/tray/counter/floor) into a hidden location. Physical
// quantity is untouched — only Is_Hidden + Hidden_Location_ID change. Modeled
// as a stock transfer so every hide action gets a real voucher number + line
// items and an audit log entry, per the Hidden Stock module's traceability rule.
router.post('/hide', authenticate, requirePermission('tenant_management'), [
  body('level').isIn(['item', 'tray', 'counter', 'floor']),
  body('ids').isArray({ min: 1 }),
  body('hiddenLocationId').isInt(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const tenantId = req.user.tenantId;
  const { level, ids, hiddenLocationId, reason } = req.body;
  const trx = await db.transaction();
  try {
    const hiddenLocation = await trx('tbl_hidden_location_master')
      .where({ Hidden_Location_ID: hiddenLocationId, Tenant_ID: tenantId, Is_Active: true }).first();
    if (!hiddenLocation) { await trx.rollback(); return sendError(res, 400, 'Invalid hidden location.'); }

    const items = await resolveOrnamentIds(trx, tenantId, level, ids, false);
    if (!items.length) { await trx.rollback(); return sendError(res, 400, 'No visible stock found for the selection.'); }

    const transferNumber = await generateTransferNumber(tenantId);
    const single = ids.length === 1 ? Number(ids[0]) : null;
    const [transfer] = await trx('tbl_stock_transfer').insert({
      Tenant_ID: tenantId,
      Transfer_Number: transferNumber,
      Transfer_Type: 'Hide',
      From_Floor_ID: level === 'floor' ? single : null,
      From_Counter_ID: level === 'counter' ? single : null,
      From_Tray_ID: level === 'tray' ? single : null,
      To_Hidden_Location_ID: hiddenLocationId,
      Status: 'Completed',
      Remarks: reason || null,
      Data_Mode: modeVal(req),
      Created_By: req.user.username,
      Approved_By: req.user.username,
      Approved_Date: new Date(),
    }).returning('*');

    await trx('tbl_stock_transfer_items').insert(items.map(i => ({
      Transfer_ID: transfer.Transfer_ID,
      Ornament_ID: i.Ornament_ID,
      Article_Number: i.Article_Number,
      Gross_Weight: i.Gross_Weight,
      Status: 'Received',
    })));

    await trx('tbl_ornament_master').whereIn('Ornament_ID', items.map(i => i.Ornament_ID)).update({
      Is_Hidden: true,
      Hidden_Location_ID: hiddenLocationId,
      Hidden_By: req.user.username,
      Hidden_Date: new Date(),
      Hidden_Reason: reason || null,
      Restored_By: null,
      Restored_Date: null,
      Last_Updated_By: req.user.username,
      Last_Updated_Date: new Date(),
    });

    await trx.commit();

    await auditLog({
      tenantId, userId: req.user.userId, tableName: 'tbl_ornament_master',
      recordId: transfer.Transfer_ID, actionType: 'HIDE',
      description: `${items.length} item(s) hidden to "${hiddenLocation.Location_Name}" via voucher ${transferNumber} (${level}-level)`,
      req,
    });

    return sendSuccess(res, { transferNumber, count: items.length }, `${items.length} item(s) hidden.`);
  } catch (err) {
    await trx.rollback();
    console.error('Hide stock error:', err);
    return sendError(res, 500, 'Failed to hide stock.');
  }
});

// ── POST /api/transfer/unhide  ───────────────────────────────────────────────
router.post('/unhide', authenticate, requirePermission('tenant_management'), [
  body('level').isIn(['item', 'tray', 'counter', 'floor']),
  body('ids').isArray({ min: 1 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const tenantId = req.user.tenantId;
  const { level, ids, reason } = req.body;
  const trx = await db.transaction();
  try {
    const items = await resolveOrnamentIds(trx, tenantId, level, ids, true);
    if (!items.length) { await trx.rollback(); return sendError(res, 400, 'No hidden stock found for the selection.'); }

    const transferNumber = await generateTransferNumber(tenantId);
    const single = ids.length === 1 ? Number(ids[0]) : null;
    const [transfer] = await trx('tbl_stock_transfer').insert({
      Tenant_ID: tenantId,
      Transfer_Number: transferNumber,
      Transfer_Type: 'Unhide',
      From_Floor_ID: level === 'floor' ? single : null,
      From_Counter_ID: level === 'counter' ? single : null,
      From_Tray_ID: level === 'tray' ? single : null,
      Status: 'Completed',
      Remarks: reason || null,
      Data_Mode: modeVal(req),
      Created_By: req.user.username,
      Approved_By: req.user.username,
      Approved_Date: new Date(),
    }).returning('*');

    await trx('tbl_stock_transfer_items').insert(items.map(i => ({
      Transfer_ID: transfer.Transfer_ID,
      Ornament_ID: i.Ornament_ID,
      Article_Number: i.Article_Number,
      Gross_Weight: i.Gross_Weight,
      Status: 'Received',
    })));

    await trx('tbl_ornament_master').whereIn('Ornament_ID', items.map(i => i.Ornament_ID)).update({
      Is_Hidden: false,
      Hidden_Location_ID: null,
      Restored_By: req.user.username,
      Restored_Date: new Date(),
      Last_Updated_By: req.user.username,
      Last_Updated_Date: new Date(),
    });

    await trx.commit();

    await auditLog({
      tenantId, userId: req.user.userId, tableName: 'tbl_ornament_master',
      recordId: transfer.Transfer_ID, actionType: 'UNHIDE',
      description: `${items.length} item(s) restored to visible stock via voucher ${transferNumber} (${level}-level)`,
      req,
    });

    return sendSuccess(res, { transferNumber, count: items.length }, `${items.length} item(s) unhidden.`);
  } catch (err) {
    await trx.rollback();
    console.error('Unhide stock error:', err);
    return sendError(res, 500, 'Failed to unhide stock.');
  }
});

// ── GET /api/transfer/:id  ────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    // Same cross-tenant fix as /approve and /reject above.
    const transfer = await db('tbl_stock_transfer').where({ Transfer_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!transfer) return sendError(res, 404, 'Transfer not found.');
    const items = await db('tbl_stock_transfer_items as ti')
      .leftJoin('tbl_ornament_master as o', 'ti.Ornament_ID', 'o.Ornament_ID')
      .leftJoin('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .where('ti.Transfer_ID', req.params.id)
      .select('ti.*', 't.Type_Name');
    return sendSuccess(res, { transfer, items });
  } catch (err) { return sendError(res, 500, 'Failed to fetch transfer.'); }
});

module.exports = router;
