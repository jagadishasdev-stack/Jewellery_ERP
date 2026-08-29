const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { modeVal } = require('../utils/dataModeFilter');
const { resolveBranchForInsert } = require('../utils/branchAccess');

const generateCustomerCode = async (tenantId, mode) => {
  const count = await db('tbl_customer_master')
    .where({ Tenant_ID: tenantId, Data_Mode: mode }).count('Customer_ID as c').first();
  const prefix = mode === 1 ? 'DEMO' : mode === 2 ? 'UNOFF' : 'CUST';
  return `${prefix}-${tenantId.replace('_', '')}-${String(parseInt(count.c) + 1).padStart(5, '0')}`;
};

// ─── GET /api/customers ───────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  const { search, isWholesale, page = 1, limit = 50 } = req.query;
  try {
    let qb = db('tbl_customer_master')
      .where({ Tenant_ID: req.user.tenantId, Is_Active: true, Data_Mode: modeVal(req) });

    if (search) {
      qb = qb.where(function () {
        this.where('Customer_Name', 'ilike', `%${search}%`)
          .orWhere('Mobile_1', 'like', `%${search}%`)
          .orWhere('Customer_Code', 'ilike', `%${search}%`);
      });
    }
    if (isWholesale !== undefined) qb = qb.where('Is_Wholesale', isWholesale === 'true');

    const [{ count }] = await qb.clone().count('Customer_ID as count');
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const data = await qb.orderBy('Customer_Name').limit(parseInt(limit)).offset(offset);

    return sendSuccess(res, { items: data, total: parseInt(count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch customers.');
  }
});

// ─── GET /api/customers/search ────────────────────────────────────────────────
router.get('/search', authenticate, async (req, res) => {
  const { mobile, name } = req.query;
  try {
    let qb = db('tbl_customer_master')
      .where({ Tenant_ID: req.user.tenantId, Is_Active: true, Data_Mode: modeVal(req) });
    if (mobile || name) {
      qb = qb.where(function () {
        if (mobile) this.orWhere('Mobile_1', 'like', `%${mobile}%`);
        if (name)   this.orWhere('Customer_Name', 'ilike', `%${name}%`);
      });
    }
    const customers = await qb.limit(20);
    return sendSuccess(res, customers);
  } catch (err) {
    return sendError(res, 500, 'Search failed.');
  }
});

// ─── GET /api/customers/:id ───────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const customer = await db('tbl_customer_master')
      .where({ Customer_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .first();
    if (!customer) return sendError(res, 404, 'Customer not found.');
    return sendSuccess(res, customer);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch customer.');
  }
});

// ─── GET /api/customers/:id/history ──────────────────────────────────────────
router.get('/:id/history', authenticate, async (req, res) => {
  try {
    const history = await db('tbl_sales_header')
      .where({ Customer_ID: req.params.id, Tenant_ID: req.user.tenantId, Data_Mode: modeVal(req) })
      .orderBy('Sale_Date', 'desc')
      .select('Sale_ID', 'Invoice_Number', 'Sale_Date', 'Net_Payable_Amount', 'Payment_Status', 'Sale_Type');
    return sendSuccess(res, history);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch purchase history.');
  }
});

// ─── POST /api/customers ──────────────────────────────────────────────────────
router.post('/', authenticate, [
  body('Customer_Name').trim().notEmpty().withMessage('Customer name required'),
  body('Mobile_1').trim().isMobilePhone('en-IN').withMessage('Valid mobile number required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  try {
    const tenantId = req.user.tenantId;
    const mode = modeVal(req);
    const customerCode = await generateCustomerCode(tenantId, mode);

    const [customer] = await db('tbl_customer_master').insert({
      ...req.body,
      Tenant_ID: tenantId,
      // Multi-Branch Management — "Primary Branch" (spec §18). Deliberately
      // NOT used to hard-filter the customer list below: a customer can
      // walk into any branch, and staff there must still be able to find
      // them — only stock/sales are branch-isolated, customers are
      // branch-ASSOCIATED, not branch-SILOED. See utils/branchAccess.js.
      Branch_ID: resolveBranchForInsert(req, req.body.Branch_ID),
      Customer_Code: customerCode,
      Data_Mode: mode,
      Created_By: req.user.username,
    }).returning('*');

    return sendSuccess(res, customer, 'Customer added successfully.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Mobile number already registered.');
    return sendError(res, 500, 'Failed to add customer.');
  }
});

// ─── PUT /api/customers/:id ───────────────────────────────────────────────────
router.put('/:id', authenticate, async (req, res) => {
  try {
    const [updated] = await db('tbl_customer_master')
      .where({ Customer_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ ...req.body, Modified_Date: new Date() })
      .returning('*');
    if (!updated) return sendError(res, 404, 'Customer not found.');
    return sendSuccess(res, updated, 'Customer updated.');
  } catch (err) {
    // Customer_Code is unique across the whole system (not just this
    // tenant) — this only became reachable from the UI once manual code
    // editing was added, so give it a real message instead of a bare 500.
    if (err.code === '23505') return sendError(res, 409, 'That customer code is already in use.');
    return sendError(res, 500, 'Failed to update customer.');
  }
});

module.exports = router;
