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
  try {
    const [row] = await db('tbl_einvoice_log').where({ Log_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: 'Cancelled', Cancelled_Date: new Date(), Cancellation_Reason: req.body.Cancellation_Reason }).returning('*');
    if (!row) return sendError(res, 404, 'e-Invoice log entry not found.');
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

module.exports = router;
