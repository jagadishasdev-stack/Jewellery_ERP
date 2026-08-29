/**
 * Branch Orders — a branch REQUESTING stock (pull model), the opposite
 * direction from the existing Interbranch Stock Transfer (push: source
 * branch initiates). Genuinely absent before. Fulfillment deliberately
 * reuses the real Transfer flow (POST /transfer/create) rather than
 * duplicating item-picking logic here — this module only tracks the
 * request/approval lifecycle and links to the Transfer once it exists.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { nextNumber } = require('../utils/numberFormat');
const { requireValidBranch } = require('../utils/branchAccess');
const { isValidMetalType } = require('../utils/metalTypes');

// Deliberately NOT branch-filtered: a fulfilling branch needs to see
// requests raised by OTHER branches to decide who can supply them — this
// is a shared cross-branch pool by nature, not per-branch data.
router.get('/', authenticate, async (req, res) => {
  try {
    const { status } = req.query;
    let qb = db('tbl_branch_order_request as r')
      .where('r.Tenant_ID', req.user.tenantId)
      .leftJoin('tbl_branch_master as rb', 'r.Requesting_Branch_ID', 'rb.Branch_ID')
      .leftJoin('tbl_branch_master as sb', 'r.Source_Branch_ID', 'sb.Branch_ID')
      .leftJoin('tbl_item_type_master as t', 'r.Type_ID', 't.Type_ID')
      .select('r.*', 'rb.Branch_Name as Requesting_Branch_Name', 'sb.Branch_Name as Source_Branch_Name', 't.Type_Name');
    if (status) qb = qb.where('r.Status', status);
    return sendSuccess(res, await qb.orderBy('r.Created_Date', 'desc'));
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch branch order requests.');
  }
});

router.post('/', authenticate, requireValidBranch, [
  body('Requesting_Branch_ID').notEmpty(),
  body('Metal_Type').custom(async (value) => { if (!(await isValidMetalType(value))) throw new Error('Invalid metal type'); return true; }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const requestNumber = await nextNumber({ tenantId: req.user.tenantId, table: 'tbl_branch_order_request', column: 'Request_Number', prefix: 'BOR', tenantCode: req.user.tenantId, padWidth: 5 });
    const [row] = await db('tbl_branch_order_request').insert({
      Tenant_ID: req.user.tenantId,
      Request_Number: requestNumber,
      Requesting_Branch_ID: req.body.Requesting_Branch_ID,
      Type_ID: req.body.Type_ID || null,
      Design_ID: req.body.Design_ID || null,
      Metal_Type: req.body.Metal_Type,
      Requested_Weight: req.body.Requested_Weight || null,
      Requested_Quantity: req.body.Requested_Quantity || 1,
      Notes: req.body.Notes || null,
      Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, row, `Branch order request ${requestNumber} created.`, 201);
  } catch (err) {
    return sendError(res, 500, 'Failed to create branch order request.');
  }
});

// A DIFFERENT branch (the one that will fulfill it) approves and picks
// itself as the source — does NOT create a transfer; staff do that
// separately through the existing, proven Transfer flow, then link it
// below. Keeping this a separate step avoids this module quietly growing
// its own parallel item-picking logic.
router.post('/:id/approve', authenticate, [body('Source_Branch_ID').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const request = await db('tbl_branch_order_request').where({ Request_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!request) return sendError(res, 404, 'Request not found.');
    if (request.Status !== 'Requested') return sendError(res, 400, `Request is already ${request.Status}.`);
    const [row] = await db('tbl_branch_order_request').where({ Request_ID: req.params.id })
      .update({ Status: 'Approved', Source_Branch_ID: req.body.Source_Branch_ID, Approved_By: req.user.username, Approved_Date: new Date() })
      .returning('*');
    return sendSuccess(res, row, 'Request approved.');
  } catch (err) {
    return sendError(res, 500, 'Failed to approve request.');
  }
});

router.post('/:id/reject', authenticate, async (req, res) => {
  try {
    const request = await db('tbl_branch_order_request').where({ Request_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!request) return sendError(res, 404, 'Request not found.');
    if (!['Requested', 'Approved'].includes(request.Status)) return sendError(res, 400, `Request is already ${request.Status}.`);
    const [row] = await db('tbl_branch_order_request').where({ Request_ID: req.params.id }).update({ Status: 'Rejected' }).returning('*');
    return sendSuccess(res, row, 'Request rejected.');
  } catch (err) {
    return sendError(res, 500, 'Failed to reject request.');
  }
});

// Links an already-created, real Transfer to this request once the
// source branch has actually sent the stock — this is the moment the
// request becomes a real, item-level transaction, and it reuses whatever
// tbl_stock_transfer already recorded rather than re-deriving it.
router.post('/:id/link-transfer', authenticate, [body('Transfer_ID').isInt()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const request = await db('tbl_branch_order_request').where({ Request_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!request) return sendError(res, 404, 'Request not found.');
    if (request.Status !== 'Approved') return sendError(res, 400, 'Request must be Approved before linking a transfer.');
    const transfer = await db('tbl_stock_transfer').where({ Transfer_ID: req.body.Transfer_ID, Tenant_ID: req.user.tenantId }).first();
    if (!transfer) return sendError(res, 404, 'Transfer not found.');
    const [row] = await db('tbl_branch_order_request').where({ Request_ID: req.params.id })
      .update({ Status: 'Transferred', Transfer_ID: req.body.Transfer_ID }).returning('*');
    return sendSuccess(res, row, 'Linked to transfer.');
  } catch (err) {
    return sendError(res, 500, 'Failed to link transfer.');
  }
});

module.exports = router;
