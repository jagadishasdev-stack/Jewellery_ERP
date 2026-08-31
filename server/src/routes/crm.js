const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { requireModuleAccess } = require('../utils/moduleOverride');
const dayjs = require('dayjs');

// ── Leads ───────────────────────────────────────────────────────────────────────
router.get('/leads', authenticate, requireModuleAccess('crm', 'View'), async (req, res) => {
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

router.post('/leads', authenticate, requireModuleAccess('crm', 'Add'), [body('Lead_Name').notEmpty(), body('Mobile').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_crm_lead').insert({ ...req.body, Tenant_ID: req.user.tenantId, Status: 'New', Created_By: req.user.username }).returning('*');
    return sendSuccess(res, row, 'Lead created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create lead.'); }
});

router.put('/leads/:id', authenticate, requireModuleAccess('crm', 'Edit'), async (req, res) => {
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
router.post('/leads/:id/convert', authenticate, requireModuleAccess('crm', 'Approve'), async (req, res) => {
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
  } catch (err) {
    // Real, previously-broken bug: a mobile number matching an existing
    // customer's tbl_customer_master UNIQUE(Tenant_ID, Mobile_1) threw a
    // raw Postgres unique-violation, surfaced as an opaque 500 with the
    // raw DB error text — and the lead was left un-converted with no
    // clear signal why. Now a clean, actionable 409.
    if (err.code === '23505') return sendError(res, 409, 'A customer with this mobile number already exists — link the lead to that customer manually instead.');
    return sendError(res, 500, 'Failed to convert lead: ' + err.message);
  }
});

// ── Follow-ups ───────────────────────────────────────────────────────────────────
router.get('/followups', authenticate, requireModuleAccess('crm', 'View'), async (req, res) => {
  const { leadId, customerId, dueOnly } = req.query;
  try {
    let qb = db('tbl_crm_followup').where('Tenant_ID', req.user.tenantId);
    if (leadId) qb = qb.where('Lead_ID', leadId);
    if (customerId) qb = qb.where('Customer_ID', customerId);
    if (dueOnly === 'true') qb = qb.where('Next_Followup_Date', '<=', dayjs().format('YYYY-MM-DD'));
    return sendSuccess(res, await qb.orderBy('Followup_Date', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch follow-ups.'); }
});

router.post('/followups', authenticate, requireModuleAccess('crm', 'Add'), [body('Remarks').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_crm_followup').insert({ ...req.body, Tenant_ID: req.user.tenantId, Done_By: req.user.userId }).returning('*');
    return sendSuccess(res, row, 'Follow-up logged.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to log follow-up.'); }
});

// ── Feedback ─────────────────────────────────────────────────────────────────────
router.get('/feedback', authenticate, requireModuleAccess('crm', 'View'), async (req, res) => {
  const { status } = req.query;
  try {
    let qb = db('tbl_customer_feedback as f')
      .leftJoin('tbl_customer_master as c', 'f.Customer_ID', 'c.Customer_ID')
      .where('f.Tenant_ID', req.user.tenantId)
      .select('f.*', 'c.Customer_Name');
    if (status) qb = qb.where('f.Status', status);
    const rows = await qb.orderBy('f.Created_Date', 'desc');
    // Kumudu Schema Audit — attach each feedback's itemized ratings (if
    // any were given) rather than a separate round-trip per row.
    const ids = rows.map((r) => r.Feedback_ID);
    const itemized = ids.length
      ? await db('tbl_crm_feedback_ratings as r').join('tbl_crm_rating_criteria as c', 'r.Criteria_ID', 'c.Criteria_ID')
          .whereIn('r.Feedback_ID', ids).select('r.Feedback_ID', 'c.Criteria_Name', 'r.Score')
      : [];
    const byFeedback = {};
    itemized.forEach((i) => { (byFeedback[i.Feedback_ID] ||= []).push({ Criteria_Name: i.Criteria_Name, Score: i.Score }); });
    return sendSuccess(res, rows.map((r) => ({ ...r, Itemized_Ratings: byFeedback[r.Feedback_ID] || [] })));
  } catch (err) { return sendError(res, 500, 'Failed to fetch feedback.'); }
});

router.post('/feedback', authenticate, requireModuleAccess('crm', 'Add'), [body('Rating').isInt({ min: 1, max: 5 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  // Kumudu Schema Audit — optional itemized breakdown on top of the
  // existing single aggregate Rating (e.g. Showroom/Staff/Product
  // Quality each scored separately), never required so existing callers
  // keep working unchanged.
  const { Ratings, ...feedbackBody } = req.body;
  const trx = await db.transaction();
  try {
    const [row] = await trx('tbl_customer_feedback').insert({ ...feedbackBody, Tenant_ID: req.user.tenantId, Status: 'Open' }).returning('*');
    if (Array.isArray(Ratings) && Ratings.length) {
      for (const r of Ratings) {
        if (!r.Criteria_ID || !Number.isInteger(r.Score) || r.Score < 1 || r.Score > 5) continue; // skip malformed entries rather than fail the whole submission
        await trx('tbl_crm_feedback_ratings').insert({ Feedback_ID: row.Feedback_ID, Criteria_ID: r.Criteria_ID, Score: r.Score });
      }
    }
    await trx.commit();
    return sendSuccess(res, row, 'Feedback recorded.', 201);
  } catch (err) {
    await trx.rollback();
    return sendError(res, 500, 'Failed to record feedback.');
  }
});

// ── Feedback Rating Criteria (tenant-configurable, e.g. Showroom / Staff / Making Charges) ──
router.get('/rating-criteria', authenticate, requireModuleAccess('crm', 'View'), async (req, res) => {
  try {
    return sendSuccess(res, await db('tbl_crm_rating_criteria').where({ Tenant_ID: req.user.tenantId, Is_Active: true }).orderBy('Sort_Order'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch rating criteria.'); }
});

router.post('/rating-criteria', authenticate, requireModuleAccess('crm', 'Add'), [body('Criteria_Name').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_crm_rating_criteria').insert({ ...req.body, Tenant_ID: req.user.tenantId }).returning('*');
    return sendSuccess(res, row, 'Rating criteria added.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'That criteria already exists.');
    return sendError(res, 500, 'Failed to add rating criteria.');
  }
});

// ── Configurable dropdown lists (Lead Source / Enquiry Source / Info Source / Newspaper / Place / Profession) ──
// One generic, List_Type-discriminated table rather than six near-identical
// ones — replaces the hardcoded Source enum's fixed options with something
// tenant-editable, without changing the existing free-string Source column.
const LIST_TYPES = ['LeadSource', 'EnquirySource', 'InfoSource', 'Newspaper', 'Place', 'Profession'];

router.get('/lists/:type', authenticate, requireModuleAccess('crm', 'View'), async (req, res) => {
  if (!LIST_TYPES.includes(req.params.type)) return sendError(res, 400, `Unknown list type. Use: ${LIST_TYPES.join(', ')}`);
  try {
    return sendSuccess(res, await db('tbl_crm_list_master').where({ Tenant_ID: req.user.tenantId, List_Type: req.params.type, Is_Active: true }).orderBy('Sort_Order'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch list.'); }
});

router.post('/lists/:type', authenticate, requireModuleAccess('crm', 'Add'), [body('Value').notEmpty()], async (req, res) => {
  if (!LIST_TYPES.includes(req.params.type)) return sendError(res, 400, `Unknown list type. Use: ${LIST_TYPES.join(', ')}`);
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_crm_list_master').insert({ Tenant_ID: req.user.tenantId, List_Type: req.params.type, Value: req.body.Value, Sort_Order: req.body.Sort_Order || 0 }).returning('*');
    return sendSuccess(res, row, 'Added.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'That value already exists in this list.');
    return sendError(res, 500, 'Failed to add to list.');
  }
});

router.put('/feedback/:id/resolve', authenticate, requireModuleAccess('crm', 'Edit'), [body('Resolution_Notes').notEmpty()], async (req, res) => {
  // Real, previously-broken bug: this validator was declared but never
  // enforced — a missing Resolution_Notes still resolved the feedback
  // with a null note instead of 400ing.
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_customer_feedback').where({ Feedback_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: 'Resolved', Resolution_Notes: req.body.Resolution_Notes }).returning('*');
    if (!row) return sendError(res, 404, 'Feedback not found.');
    return sendSuccess(res, row, 'Feedback resolved.');
  } catch (err) { return sendError(res, 500, 'Failed to resolve feedback.'); }
});

module.exports = router;
