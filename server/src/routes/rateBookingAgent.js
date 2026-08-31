const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { requireModuleAccess } = require('../utils/moduleOverride');
const { nextNumber } = require('../utils/numberFormat');
const dayjs = require('dayjs');

// ── Agent Master ────────────────────────────────────────────────────────────────
// (tbl_agent_master pre-existed this pass with no route of its own yet.)
router.get('/agents', authenticate, requireModuleAccess('rate_booking_agent_commission', 'View'), async (req, res) => {
  try { return sendSuccess(res, await db('tbl_agent_master').where('Tenant_ID', req.user.tenantId).where('Status', 'Active')); }
  catch (err) { return sendError(res, 500, 'Failed to fetch agents.'); }
});

router.post('/agents', authenticate, requireModuleAccess('rate_booking_agent_commission', 'Add'), [body('Agent_Name').notEmpty(), body('Mobile').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const tenantId = req.user.tenantId;
    // Agent_Code has a GLOBAL unique constraint (not scoped per tenant),
    // but this used to generate it from only THIS tenant's own last
    // Agent_ID ("AGT1", "AGT2", ...) — so any two tenants' first agent
    // collided on "AGT1", failing outright. Confirmed for real: DLJ
    // already held "AGT1" before this fix, blocking every other tenant
    // from ever creating their first rate-booking agent. Prefixing with
    // the tenant ID (matching Vendor_Code/Member_Number elsewhere in this
    // codebase) makes it actually unique.
    const last = await db('tbl_agent_master').where('Tenant_ID', tenantId).orderBy('Agent_ID', 'desc').first();
    const [row] = await db('tbl_agent_master').insert({
      ...req.body, Tenant_ID: tenantId,
      Agent_Code: req.body.Agent_Code || `AGT-${tenantId.replace('_', '')}-${(last?.Agent_ID || 0) + 1}`,
      // Kumudu Schema Audit — distinguishes this from savingsScheme.js's
      // field collection agents, which now share the same table.
      Agent_Type: 'Rate_Booking',
      Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, row, 'Agent created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Agent code or mobile number already exists.');
    return sendError(res, 500, 'Failed to create agent.');
  }
});

// ── Rate Booking ────────────────────────────────────────────────────────────────
router.get('/rate-bookings', authenticate, requireModuleAccess('rate_booking_agent_commission', 'View'), async (req, res) => {
  const { status } = req.query;
  try {
    let qb = db('tbl_rate_booking as r')
      .leftJoin('tbl_customer_master as c', 'r.Customer_ID', 'c.Customer_ID')
      .where('r.Tenant_ID', req.user.tenantId).select('r.*', 'c.Customer_Name', 'c.Mobile_1');
    if (status) qb = qb.where('r.Status', status);
    else qb = qb.whereNot('r.Status', 'Cancelled');
    return sendSuccess(res, await qb.orderBy('r.Booking_Date', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch rate bookings.'); }
});

router.post('/rate-bookings', authenticate, requireModuleAccess('rate_booking_agent_commission', 'Add'), [
  body('Metal_Type').notEmpty(), body('Booked_Rate').isFloat({ gt: 0 }), body('Weight_Booked').isFloat({ gt: 0 }), body('Valid_Until').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const tenantId = req.user.tenantId;
    // tenantCode passed as the raw tenantId (not underscore-stripped) —
    // this route never stripped it, kept as-is so switching to the shared
    // helper doesn't change anyone's default output.
    const bookingNumber = await nextNumber({
      tenantId, table: 'tbl_rate_booking', column: 'Booking_Number',
      prefix: 'RB', tenantCode: tenantId, padWidth: 4,
    });
    const [row] = await db('tbl_rate_booking').insert({
      ...req.body, Tenant_ID: tenantId, Booking_Number: bookingNumber,
      Booking_Date: req.body.Booking_Date || dayjs().format('YYYY-MM-DD'), Status: 'Open', Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, row, 'Rate booked.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to book rate.'); }
});

// POST /:id/utilize — links a booking to the sale that used it, so a
// billing screen can pull the locked rate instead of the day's current one.
router.post('/rate-bookings/:id/utilize', authenticate, requireModuleAccess('rate_booking_agent_commission', 'Edit'), [body('Utilized_Sale_ID').notEmpty()], async (req, res) => {
  // Real, previously-broken bug: declared but never enforced — an empty
  // body silently marked the booking Utilized with Utilized_Sale_ID left
  // null instead of 400ing.
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const booking = await db('tbl_rate_booking').where({ Booking_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!booking) return sendError(res, 404, 'Booking not found.');
    if (booking.Status !== 'Open') return sendError(res, 400, `Booking is ${booking.Status}, cannot be utilized.`);
    if (dayjs(booking.Valid_Until).isBefore(dayjs())) {
      await db('tbl_rate_booking').where('Booking_ID', booking.Booking_ID).update({ Status: 'Expired' });
      return sendError(res, 400, 'Booking has expired.');
    }
    const [row] = await db('tbl_rate_booking').where('Booking_ID', booking.Booking_ID)
      .update({ Status: 'Utilized', Utilized_Sale_ID: req.body.Utilized_Sale_ID }).returning('*');
    return sendSuccess(res, row, 'Booking marked utilized.');
  } catch (err) { return sendError(res, 500, 'Failed to utilize booking.'); }
});

// ── Agent Commission ────────────────────────────────────────────────────────────
router.get('/commissions', authenticate, requireModuleAccess('rate_booking_agent_commission', 'View'), async (req, res) => {
  const { agentId, status } = req.query;
  try {
    let qb = db('tbl_agent_commission_transactions as t')
      .leftJoin('tbl_agent_master as a', 't.Agent_ID', 'a.Agent_ID')
      .where('t.Tenant_ID', req.user.tenantId).select('t.*', 'a.Agent_Name');
    if (agentId) qb = qb.where('t.Agent_ID', agentId);
    if (status) qb = qb.where('t.Status', status);
    return sendSuccess(res, await qb.orderBy('t.Created_Date', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch commissions.'); }
});

// POST /commissions — computes commission from the agent's own default
// rate (or an override) against a source amount (a sale or scheme
// enrollment), so the caller doesn't have to duplicate the % math.
router.post('/commissions', authenticate, requireModuleAccess('rate_booking_agent_commission', 'Add'), [
  body('Agent_ID').notEmpty(), body('Source_Type').isIn(['Sale', 'Scheme']), body('Source_ID').notEmpty(), body('Commission_Base_Amount').isFloat({ gt: 0 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const agent = await db('tbl_agent_master').where('Agent_ID', req.body.Agent_ID).first();
    if (!agent) return sendError(res, 404, 'Agent not found.');
    const pct = req.body.Commission_Pct_Applied ?? agent.Commission_Pct;
    const amount = Math.round(((req.body.Commission_Base_Amount * pct) / 100) * 100) / 100;
    const [row] = await db('tbl_agent_commission_transactions').insert({
      Tenant_ID: req.user.tenantId, Agent_ID: req.body.Agent_ID, Source_Type: req.body.Source_Type, Source_ID: req.body.Source_ID,
      Commission_Base_Amount: req.body.Commission_Base_Amount, Commission_Pct_Applied: pct, Commission_Amount: amount, Status: 'Pending',
    }).returning('*');
    return sendSuccess(res, row, 'Commission calculated.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to calculate commission.'); }
});

router.post('/commissions/:id/pay', authenticate, requireModuleAccess('rate_booking_agent_commission', 'Approve'), [body('Payment_Reference').optional()], async (req, res) => {
  try {
    const existing = await db('tbl_agent_commission_transactions').where({ Txn_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!existing) return sendError(res, 404, 'Commission record not found.');
    // Was previously unguarded — paying an already-Paid commission again
    // silently returned 200 and overwrote Payment_Reference.
    if (existing.Status === 'Paid') return sendError(res, 400, 'This commission has already been paid.');
    const [row] = await db('tbl_agent_commission_transactions').where({ Txn_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: 'Paid', Paid_Date: dayjs().format('YYYY-MM-DD'), Payment_Reference: req.body.Payment_Reference || null }).returning('*');
    return sendSuccess(res, row, 'Commission marked paid.');
  } catch (err) { return sendError(res, 500, 'Failed to update commission.'); }
});

module.exports = router;
