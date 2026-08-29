/**
 * Jobcard Prediction — manufacturing planning that deliberately never
 * touches real stock/production tables (per the spec: "prediction should
 * not directly alter actual stock until the actual transaction occurs").
 * Genuinely absent before this.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { nextNumber } = require('../utils/numberFormat');
const { requireValidBranch, withBranch, resolveBranchForInsert } = require('../utils/branchAccess');
const { isValidMetalType } = require('../utils/metalTypes');

router.get('/', authenticate, requireValidBranch, async (req, res) => {
  try {
    const { status, metalType } = req.query;
    let qb = withBranch(db('tbl_jobcard_prediction as j')
      .where('j.Tenant_ID', req.user.tenantId), req, 'j.Branch_ID')
      .leftJoin('tbl_customer_master as c', 'j.Customer_ID', 'c.Customer_ID')
      .leftJoin('tbl_design_master as d', 'j.Design_ID', 'd.Design_ID')
      .leftJoin('tbl_vendor_master as v', 'j.Karigar_ID', 'v.Vendor_ID')
      .select('j.*', 'c.Customer_Name', 'd.Design_Name', 'v.Vendor_Name as Karigar_Name');
    if (status) qb = qb.where('j.Status', status);
    if (metalType) qb = qb.where('j.Metal_Type', metalType);
    return sendSuccess(res, await qb.orderBy('j.Created_Date', 'desc'));
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch jobcard predictions.');
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const row = await db('tbl_jobcard_prediction').where({ Jobcard_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!row) return sendError(res, 404, 'Jobcard prediction not found.');
    return sendSuccess(res, row);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch jobcard prediction.');
  }
});

router.post('/', authenticate, requireValidBranch, [
  body('Metal_Type').custom(async (value) => { if (!(await isValidMetalType(value))) throw new Error('Invalid metal type'); return true; }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const jobcardNumber = await nextNumber({ tenantId: req.user.tenantId, table: 'tbl_jobcard_prediction', column: 'Jobcard_Number', prefix: 'JCP', tenantCode: req.user.tenantId, padWidth: 5 });
    const [row] = await db('tbl_jobcard_prediction').insert({
      Tenant_ID: req.user.tenantId,
      Branch_ID: resolveBranchForInsert(req, req.body.Branch_ID),
      Jobcard_Number: jobcardNumber,
      Customer_ID: req.body.Customer_ID || null,
      Design_ID: req.body.Design_ID || null,
      Metal_Type: req.body.Metal_Type,
      Karigar_ID: req.body.Karigar_ID || null,
      Expected_Weight: req.body.Expected_Weight || null,
      Expected_Completion_Date: req.body.Expected_Completion_Date || null,
      Estimated_Wastage_Pct: req.body.Estimated_Wastage_Pct || null,
      Estimated_Making_Charge: req.body.Estimated_Making_Charge || null,
      Material_Requirement: req.body.Material_Requirement || null,
      Notes: req.body.Notes || null,
      Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, row, `Jobcard prediction ${jobcardNumber} created.`, 201);
  } catch (err) {
    return sendError(res, 500, 'Failed to create jobcard prediction.');
  }
});

router.put('/:id/status', authenticate, [body('Status').isIn(['Draft', 'Confirmed', 'Converted', 'Cancelled'])], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_jobcard_prediction').where({ Jobcard_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: req.body.Status, Modified_Date: new Date() }).returning('*');
    if (!row) return sendError(res, 404, 'Jobcard prediction not found.');
    return sendSuccess(res, row, 'Status updated.');
  } catch (err) {
    return sendError(res, 500, 'Failed to update status.');
  }
});

module.exports = router;
