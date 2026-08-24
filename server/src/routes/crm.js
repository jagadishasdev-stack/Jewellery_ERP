const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const dayjs = require('dayjs');

// ── Leads ───────────────────────────────────────────────────────────────────────
router.get('/leads', authenticate, async (req, res) => {
  const { status, assignedTo } = req.query;
  try {
    let qb = db('tbl_crm_lead as l')
      .leftJoin('tbl_user_master as u', 'l.Assigned_To', 'u.User_ID')
      .where('l.Tenant_ID', req.user.tenantId)
      .select('l.*', 'u.Full_Name as Assigned_To_Name');
    if (status) qb = qb.where('l.Status', status);
    if (assignedTo) qb = qb.where('l.Assigned_To', assignedTo);
    return sendSuccess(res, await qb.orderBy('l.Created_Date', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch leads.'); }
});

router.post('/leads', authenticate, [body('Lead_Name').notEmpty(), body('Mobile').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_crm_lead').insert({ ...req.body, Tenant_ID: req.user.tenantId, Status: 'New', Created_By: req.user.username }).returning('*');
    return sendSuccess(res, row, 'Lead created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create lead.'); }
});

router.put('/leads/:id', authenticate, async (req, res) => {
  try {
    const [row] = await db('tbl_crm_lead').where({ Lead_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ ...req.body, Modified_Date: new Date() }).returning('*');
    if (!row) return sendError(res, 404, 'Lead not found.');
    return sendSuccess(res, row, 'Lead updated.');
  } catch (err) { return sendError(res, 500, 'Failed to update lead.'); }
});

// POST /api/crm/leads/:id/convert — turns a lead into a real customer record
// in one step (rather than the caller having to POST /customers separately
// and then remember to also close out the lead).
router.post('/leads/:id/convert', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    const lead = await db('tbl_crm_lead').where({ Lead_ID: req.params.id, Tenant_ID: tenantId }).first();
    if (!lead) return sendError(res, 404, 'Lead not found.');
    if (lead.Converted_Customer_ID) return sendError(res, 400, 'Lead already converted.');

    const lastCode = await db('tbl_customer_master').where('Tenant_ID', tenantId).orderBy('Customer_ID', 'desc').first();
    const [customer] = await db('tbl_customer_master').insert({
      Tenant_ID: tenantId,
      Customer_Code: `${tenantId}-C${(lastCode?.Customer_ID || 0) + 1}`,
      Customer_Name: lead.Lead_Name,
      Mobile_1: lead.Mobile,
      Email: lead.Email,
      Is_Active: true,
      Created_By: req.user.username,
    }).returning('*');

    const [updatedLead] = await db('tbl_crm_lead').where('Lead_ID', lead.Lead_ID)
      .update({ Status: 'Converted', Converted_Customer_ID: customer.Customer_ID, Converted_Date: dayjs().format('YYYY-MM-DD') }).returning('*');

    return sendSuccess(res, { lead: updatedLead, customer }, 'Lead converted to customer.');
  } catch (err) { return sendError(res, 500, 'Failed to convert lead: ' + err.message); }
});

// ── Follow-ups ───────────────────────────────────────────────────────────────────
router.get('/followups', authenticate, async (req, res) => {
  const { leadId, customerId, dueOnly } = req.query;
  try {
    let qb = db('tbl_crm_followup').where('Tenant_ID', req.user.tenantId);
    if (leadId) qb = qb.where('Lead_ID', leadId);
    if (customerId) qb = qb.where('Customer_ID', customerId);
    if (dueOnly === 'true') qb = qb.where('Next_Followup_Date', '<=', dayjs().format('YYYY-MM-DD'));
    return sendSuccess(res, await qb.orderBy('Followup_Date', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch follow-ups.'); }
});

router.post('/followups', authenticate, [body('Remarks').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_crm_followup').insert({ ...req.body, Tenant_ID: req.user.tenantId, Done_By: req.user.userId }).returning('*');
    return sendSuccess(res, row, 'Follow-up logged.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to log follow-up.'); }
});

// ── Feedback ─────────────────────────────────────────────────────────────────────
router.get('/feedback', authenticate, async (req, res) => {
  const { status } = req.query;
  try {
    let qb = db('tbl_customer_feedback as f')
      .leftJoin('tbl_customer_master as c', 'f.Customer_ID', 'c.Customer_ID')
      .where('f.Tenant_ID', req.user.tenantId)
      .select('f.*', 'c.Customer_Name');
    if (status) qb = qb.where('f.Status', status);
    return sendSuccess(res, await qb.orderBy('f.Created_Date', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch feedback.'); }
});

router.post('/feedback', authenticate, [body('Rating').isInt({ min: 1, max: 5 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_customer_feedback').insert({ ...req.body, Tenant_ID: req.user.tenantId, Status: 'Open' }).returning('*');
    return sendSuccess(res, row, 'Feedback recorded.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to record feedback.'); }
});

router.put('/feedback/:id/resolve', authenticate, [body('Resolution_Notes').notEmpty()], async (req, res) => {
  try {
    const [row] = await db('tbl_customer_feedback').where({ Feedback_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: 'Resolved', Resolution_Notes: req.body.Resolution_Notes }).returning('*');
    if (!row) return sendError(res, 404, 'Feedback not found.');
    return sendSuccess(res, row, 'Feedback resolved.');
  } catch (err) { return sendError(res, 500, 'Failed to resolve feedback.'); }
});

module.exports = router;
