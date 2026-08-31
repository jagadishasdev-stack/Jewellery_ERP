const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { requireModuleAccess } = require('../utils/moduleOverride');
const dayjs = require('dayjs');

// ── HSN Master (global — no Tenant_ID column, shared across all tenants) ────────
router.get('/hsn', authenticate, requireModuleAccess('hsn_einvoice_loyalty', 'View'), async (req, res) => {
  try { return sendSuccess(res, await db('tbl_hsn_master').where('Is_Active', true).orderBy('HSN_Code')); }
  catch (err) { return sendError(res, 500, 'Failed to fetch HSN codes.'); }
});

router.post('/hsn', authenticate, requireModuleAccess('hsn_einvoice_loyalty', 'Add'), [body('HSN_Code').notEmpty(), body('GST_Percentage').isFloat({ min: 0 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const existing = await db('tbl_hsn_master').where('HSN_Code', req.body.HSN_Code).first();
    if (existing) return sendError(res, 409, 'HSN code already exists.');
    const [row] = await db('tbl_hsn_master').insert(req.body).returning('*');
    return sendSuccess(res, row, 'HSN code added.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to add HSN code.'); }
});

// ── e-Invoice Log ────────────────────────────────────────────────────────────────
router.get('/einvoice', authenticate, requireModuleAccess('hsn_einvoice_loyalty', 'View'), async (req, res) => {
  const { saleId, status } = req.query;
  try {
    let qb = db('tbl_einvoice_log as e')
      .leftJoin('tbl_sales_header as s', 'e.Sale_ID', 's.Sale_ID')
      .where('e.Tenant_ID', req.user.tenantId).select('e.*', 's.Invoice_Number');
    if (saleId) qb = qb.where('e.Sale_ID', saleId);
    if (status) qb = qb.where('e.Status', status);
    return sendSuccess(res, await qb.orderBy('e.Created_Date', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch e-invoice log.'); }
});

// POST /einvoice/generate — records the *intent and outcome* of generating
// an e-invoice for a sale. There is no live GSP/IRP integration wired up
// here (that needs real GSTN credentials this project doesn't have); this
// endpoint gives the rest of the app (and this table) a real, working
// contract to call today, and is the one place to plug an actual GSP client
// in later without touching any caller.
router.post('/einvoice/generate', authenticate, requireModuleAccess('hsn_einvoice_loyalty', 'Add'), [body('Sale_ID').notEmpty()], async (req, res) => {
  // Real, previously-broken bug: this validator was declared but never
  // enforced (no other route in this file makes that mistake) — a missing
  // Sale_ID fell straight through to a raw Knex "undefined binding" 500
  // instead of a clean 400/422.
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const tenantId = req.user.tenantId;
  try {
    const sale = await db('tbl_sales_header').where({ Sale_ID: req.body.Sale_ID, Tenant_ID: tenantId }).first();
    if (!sale) return sendError(res, 404, 'Sale not found.');
    const existing = await db('tbl_einvoice_log').where({ Sale_ID: sale.Sale_ID, Status: 'Generated' }).first();
    if (existing) return sendError(res, 409, 'e-Invoice already generated for this sale.');

    const [row] = await db('tbl_einvoice_log').insert({
      Tenant_ID: tenantId, Sale_ID: sale.Sale_ID, Status: 'Pending',
    }).returning('*');

    // No GSP integration configured — mark it explicitly rather than
    // fabricate a fake IRN, so nothing downstream mistakes this for a real
    // government-issued one.
    const [updated] = await db('tbl_einvoice_log').where('Log_ID', row.Log_ID)
      .update({ Status: 'Failed', Error_Message: 'No GSP/IRP provider configured for this tenant yet.' }).returning('*');
    return sendSuccess(res, updated, 'e-Invoice request logged (no GSP provider configured — see Error_Message).', 201);
  } catch (err) { return sendError(res, 500, 'Failed to process e-invoice request: ' + err.message); }
});

router.post('/einvoice/:id/cancel', authenticate, requireModuleAccess('hsn_einvoice_loyalty', 'Delete'), [body('Cancellation_Reason').notEmpty()], async (req, res) => {
  // Same class of bug as /einvoice/generate above — declared but never
  // enforced, so a missing Cancellation_Reason silently cancelled with a
  // null reason instead of 400ing.
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const existing = await db('tbl_einvoice_log').where({ Log_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!existing) return sendError(res, 404, 'e-Invoice log entry not found.');
    // Was previously unguarded — cancelling an already-cancelled entry
    // silently overwrote its Cancellation_Reason a second time.
    if (existing.Status === 'Cancelled') return sendError(res, 400, 'This e-Invoice entry is already cancelled.');
    const [row] = await db('tbl_einvoice_log').where({ Log_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: 'Cancelled', Cancelled_Date: new Date(), Cancellation_Reason: req.body.Cancellation_Reason }).returning('*');
    return sendSuccess(res, row, 'e-Invoice cancelled.');
  } catch (err) { return sendError(res, 500, 'Failed to cancel e-invoice.'); }
});

// ── Loyalty Points Slabs ─────────────────────────────────────────────────────────
router.get('/loyalty-slabs', authenticate, requireModuleAccess('hsn_einvoice_loyalty', 'View'), async (req, res) => {
  try { return sendSuccess(res, await db('tbl_loyalty_points_slab').where('Tenant_ID', req.user.tenantId).where('Is_Active', true).orderBy('Amount_From')); }
  catch (err) { return sendError(res, 500, 'Failed to fetch loyalty slabs.'); }
});

router.post('/loyalty-slabs', authenticate, requireModuleAccess('hsn_einvoice_loyalty', 'Add'), [body('Amount_From').isFloat({ min: 0 }), body('Points_Per_Unit').isFloat({ gt: 0 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_loyalty_points_slab').insert({ ...req.body, Tenant_ID: req.user.tenantId }).returning('*');
    return sendSuccess(res, row, 'Loyalty slab created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create loyalty slab.'); }
});

// GET /loyalty-slabs/calculate?amount=&metalType= — the actual points math,
// so the billing screen doesn't need to duplicate the slab-matching logic.
router.get('/loyalty-slabs/calculate', authenticate, requireModuleAccess('hsn_einvoice_loyalty', 'View'), async (req, res) => {
  const amount = parseFloat(req.query.amount);
  if (!Number.isFinite(amount) || amount <= 0) return sendError(res, 400, 'amount query param is required and must be > 0.');
  try {
    let qb = db('tbl_loyalty_points_slab').where('Tenant_ID', req.user.tenantId).where('Is_Active', true)
      .where('Amount_From', '<=', amount).where((b) => b.whereNull('Amount_To').orWhere('Amount_To', '>=', amount));
    if (req.query.metalType) qb = qb.where((b) => b.whereNull('Metal_Type').orWhere('Metal_Type', req.query.metalType));
    const slab = await qb.orderBy('Amount_From', 'desc').first();
    if (!slab) return sendSuccess(res, { points: 0, slab: null });
    return sendSuccess(res, { points: Math.round(amount * slab.Points_Per_Unit * 100) / 100, slab });
  } catch (err) { return sendError(res, 500, 'Failed to calculate loyalty points.'); }
});

// ── Loyalty Card (Members + Day Sheet) ──────────────────────────────────────────
// A card number tied to the EXISTING points engine above — not a new
// tier/benefit system. Master/Reports/Utility audit gap: only points math
// existed, no card identifier, no member list, no day sheet.
router.post('/loyalty-card/issue', authenticate, requireModuleAccess('hsn_einvoice_loyalty', 'Add'),
  [body('Customer_ID').notEmpty(), body('Card_Number').trim().notEmpty()], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());
    try {
      const customer = await db('tbl_customer_master').where({ Customer_ID: req.body.Customer_ID, Tenant_ID: req.user.tenantId }).first();
      if (!customer) return sendError(res, 404, 'Customer not found.');
      const [updated] = await db('tbl_customer_master')
        .where({ Customer_ID: req.body.Customer_ID, Tenant_ID: req.user.tenantId })
        .update({ Loyalty_Card_Number: req.body.Card_Number, Loyalty_Card_Issue_Date: db.fn.now() })
        .returning('*');
      return sendSuccess(res, updated, `Loyalty card ${req.body.Card_Number} issued to ${customer.Customer_Name}.`);
    } catch (err) {
      if (err.code === '23505') return sendError(res, 409, 'That card number is already assigned to another customer.');
      return sendError(res, 500, 'Failed to issue loyalty card.');
    }
  });

router.get('/loyalty-card/members', authenticate, requireModuleAccess('hsn_einvoice_loyalty', 'View'), async (req, res) => {
  try {
    const rows = await db('tbl_customer_master')
      .where('Tenant_ID', req.user.tenantId).whereNotNull('Loyalty_Card_Number')
      .select('Customer_ID', 'Customer_Name', 'Mobile_1', 'Loyalty_Card_Number', 'Loyalty_Card_Issue_Date', 'Loyalty_Points')
      .orderBy('Loyalty_Card_Issue_Date', 'desc');
    return sendSuccess(res, rows);
  } catch (err) { return sendError(res, 500, 'Failed to fetch loyalty card members.'); }
});

// GET /loyalty-card/day-sheet?date=YYYY-MM-DD — every loyalty point
// transaction (Earned/Redeemed/Expired/Adjusted) across ALL customers for
// one day, so a day's loyalty activity can be reviewed as a whole rather
// than customer-by-customer (dayClose.js's GET /loyalty/:customerId, still
// there, unchanged, is the per-customer equivalent).
router.get('/loyalty-card/day-sheet', authenticate, requireModuleAccess('hsn_einvoice_loyalty', 'View'), async (req, res) => {
  const date = req.query.date;
  if (!date) return sendError(res, 400, 'date query param (YYYY-MM-DD) is required.');
  try {
    const rows = await db('tbl_loyalty_transactions as l')
      .leftJoin('tbl_customer_master as c', 'l.Customer_ID', 'c.Customer_ID')
      .where('l.Tenant_ID', req.user.tenantId)
      .whereRaw('DATE(l."Created_Date") = ?', [date])
      .select('l.*', 'c.Customer_Name', 'c.Loyalty_Card_Number')
      .orderBy('l.Created_Date', 'desc');
    const earned = rows.filter((r) => r.Txn_Type === 'Earned').reduce((s, r) => s + parseFloat(r.Points || 0), 0);
    const redeemed = rows.filter((r) => r.Txn_Type === 'Redeemed').reduce((s, r) => s + parseFloat(r.Points || 0), 0);
    return sendSuccess(res, { date, transactions: rows, totalEarned: earned, totalRedeemed: redeemed });
  } catch (err) { return sendError(res, 500, 'Failed to fetch loyalty day sheet.'); }
});

module.exports = router;
