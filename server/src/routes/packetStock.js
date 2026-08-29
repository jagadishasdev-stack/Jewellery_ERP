/**
 * Packet Stock — grouping ornaments into one physical packet (a sealed
 * pouch of similar small items, tracked and moved as one unit). Was
 * completely absent before (Missing Feature Report, Transaction Menu
 * spec) — purely additive, doesn't touch any existing stock table.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { nextNumber } = require('../utils/numberFormat');
const { requireValidBranch, withBranch, resolveBranchForInsert } = require('../utils/branchAccess');
const { auditLog } = require('../utils/auditLogger');

async function genPacketNumber(tenantId) {
  return nextNumber({ tenantId, table: 'tbl_packet_stock', column: 'Packet_Number', prefix: 'PKT', tenantCode: tenantId, padWidth: 5 });
}

// ─── GET /api/packet-stock — list ──────────────────────────────────────────────
router.get('/', authenticate, requireValidBranch, async (req, res) => {
  try {
    const { status, metalType } = req.query;
    let qb = withBranch(db('tbl_packet_stock as pk')
      .where('pk.Tenant_ID', req.user.tenantId), req, 'pk.Branch_ID')
      .leftJoin('tbl_floor_master as fl', 'pk.Floor_ID', 'fl.Floor_ID')
      .leftJoin('tbl_counter_master as c', 'pk.Counter_ID', 'c.Counter_ID')
      .select('pk.*', 'fl.Floor_Name', 'c.Counter_Name',
        db.raw('(SELECT COUNT(*) FROM tbl_packet_stock_items i WHERE i."Packet_ID" = pk."Packet_ID" AND i."Removed_Date" IS NULL) as item_count'));
    if (status) qb = qb.where('pk.Status', status);
    if (metalType) qb = qb.where('pk.Metal_Type', metalType);
    const rows = await qb.orderBy('pk.Created_Date', 'desc');
    return sendSuccess(res, rows);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch packet stock.');
  }
});

// ─── GET /api/packet-stock/:id — detail with items ─────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const packet = await db('tbl_packet_stock').where({ Packet_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!packet) return sendError(res, 404, 'Packet not found.');
    const items = await db('tbl_packet_stock_items as i')
      .join('tbl_ornament_master as o', 'i.Ornament_ID', 'o.Ornament_ID')
      .leftJoin('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .where('i.Packet_ID', req.params.id).whereNull('i.Removed_Date')
      .select('i.Packet_Item_ID', 'o.Ornament_ID', 'o.Article_Number', 'o.Gross_Weight', 'o.Net_Gold_Weight', 't.Type_Name', 'i.Added_Date');
    return sendSuccess(res, { packet, items });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch packet.');
  }
});

// ─── POST /api/packet-stock — create ───────────────────────────────────────────
router.post('/', authenticate, requireValidBranch, [body('Metal_Type').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const packetNumber = await genPacketNumber(req.user.tenantId);
    const [packet] = await db('tbl_packet_stock').insert({
      Tenant_ID: req.user.tenantId,
      Branch_ID: resolveBranchForInsert(req, req.body.Branch_ID),
      Packet_Number: packetNumber,
      Metal_Type: req.body.Metal_Type,
      Floor_ID: req.body.Floor_ID || null,
      Counter_ID: req.body.Counter_ID || null,
      Notes: req.body.Notes || null,
      Created_By: req.user.username,
    }).returning('*');
    await auditLog({ tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_packet_stock', recordId: packet.Packet_ID, actionType: 'INSERT', newData: packet, description: `Packet ${packetNumber} created`, req });
    return sendSuccess(res, packet, 'Packet created.', 201);
  } catch (err) {
    return sendError(res, 500, 'Failed to create packet.');
  }
});

// ─── POST /api/packet-stock/:id/items — add an ornament to the packet ─────────
router.post('/:id/items', authenticate, [body('Ornament_ID').isInt()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const packet = await db('tbl_packet_stock').where({ Packet_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!packet) return sendError(res, 404, 'Packet not found.');
    if (packet.Status !== 'Open') return sendError(res, 400, `Packet is ${packet.Status} — cannot add items.`);

    const ornament = await db('tbl_ornament_master').where({ Ornament_ID: req.body.Ornament_ID, Tenant_ID: req.user.tenantId }).first();
    if (!ornament) return sendError(res, 404, 'Ornament not found.');

    const alreadyIn = await db('tbl_packet_stock_items').where({ Packet_ID: req.params.id, Ornament_ID: req.body.Ornament_ID }).whereNull('Removed_Date').first();
    if (alreadyIn) return sendError(res, 409, 'This ornament is already in this packet.');

    const [item] = await db('tbl_packet_stock_items').insert({ Packet_ID: req.params.id, Ornament_ID: req.body.Ornament_ID }).returning('*');
    return sendSuccess(res, item, 'Item added to packet.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'This ornament is already active in another packet — remove it there first.');
    return sendError(res, 500, 'Failed to add item.');
  }
});

// ─── DELETE /api/packet-stock/:id/items/:itemId — remove an item ─────────────
router.delete('/:id/items/:itemId', authenticate, async (req, res) => {
  try {
    const packet = await db('tbl_packet_stock').where({ Packet_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!packet) return sendError(res, 404, 'Packet not found.');
    if (packet.Status !== 'Open') return sendError(res, 400, `Packet is ${packet.Status} — cannot remove items.`);
    const [updated] = await db('tbl_packet_stock_items')
      .where({ Packet_Item_ID: req.params.itemId, Packet_ID: req.params.id }).whereNull('Removed_Date')
      .update({ Removed_Date: new Date() }).returning('*');
    if (!updated) return sendError(res, 404, 'Item not found in this packet.');
    return sendSuccess(res, updated, 'Item removed from packet.');
  } catch (err) {
    return sendError(res, 500, 'Failed to remove item.');
  }
});

// ─── POST /api/packet-stock/:id/close — seal the packet ───────────────────────
router.post('/:id/close', authenticate, async (req, res) => {
  try {
    const packet = await db('tbl_packet_stock').where({ Packet_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!packet) return sendError(res, 404, 'Packet not found.');
    if (packet.Status !== 'Open') return sendError(res, 400, `Packet is already ${packet.Status}.`);
    const itemCount = await db('tbl_packet_stock_items').where({ Packet_ID: req.params.id }).whereNull('Removed_Date').count('Packet_Item_ID as c').first();
    if (parseInt(itemCount.c) === 0) return sendError(res, 400, 'Cannot close an empty packet.');
    const [updated] = await db('tbl_packet_stock').where({ Packet_ID: req.params.id }).update({ Status: 'Closed', Closed_Date: new Date() }).returning('*');
    return sendSuccess(res, updated, 'Packet closed.');
  } catch (err) {
    return sendError(res, 500, 'Failed to close packet.');
  }
});

module.exports = router;
