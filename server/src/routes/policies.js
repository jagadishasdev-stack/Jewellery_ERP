/**
 * Policy sections admin CRUD — Terms & Conditions, About Us, Privacy,
 * Return/Refund, Shipping/Delivery. Tenant-scoped, with a global
 * (Tenant_ID IS NULL) fallback used by savings_app until a tenant sets
 * its own sections for a given Policy_Type (see /api/mobile/policies/:tenantId
 * in mobileAuth.js for the public read side consumed by the app).
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../utils/auditLogger');

router.use(authenticate);

const VALID_TYPES = ['TERMS', 'ABOUT', 'PRIVACY', 'RETURN', 'SHIPPING'];

// Super Admin may override via ?tenantId= (empty/'null' means the global
// default rows); everyone else is locked to their own tenant.
const resolveTenantId = (req) => {
  if (req.user.roleName === 'Super Admin' && 'tenantId' in req.query) {
    const q = req.query.tenantId;
    return (!q || q === 'null') ? null : q;
  }
  return req.user.tenantId;
};

// ─── GET /api/policies?type=TERMS ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  const tenantId = resolveTenantId(req);
  const { type } = req.query;
  try {
    let qb = tenantId
      ? db('tbl_scheme_policies').where({ Tenant_ID: tenantId })
      : db('tbl_scheme_policies').whereNull('Tenant_ID');
    if (type) qb = qb.where({ Policy_Type: type });
    const rows = await qb.orderBy(['Policy_Type', 'Sort_Order']);
    return sendSuccess(res, rows);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch policies.');
  }
});

// ─── POST /api/policies ────────────────────────────────────────────────────────
router.post('/', [
  body('Policy_Type').isIn(VALID_TYPES).withMessage(`Policy_Type must be one of ${VALID_TYPES.join(', ')}`),
  body('Section_Title').trim().notEmpty(),
  body('Section_Content').trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const tenantId = resolveTenantId(req);
  const { Policy_Type, Section_Title, Section_Content, Sort_Order, Is_Active } = req.body;

  try {
    const [row] = await db('tbl_scheme_policies').insert({
      Tenant_ID: tenantId,
      Policy_Type, Section_Title, Section_Content,
      Sort_Order: Sort_Order || 0,
      Is_Active: Is_Active !== false,
    }).returning('*');

    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_scheme_policies',
      recordId: row.Policy_ID, actionType: 'INSERT',
      description: `Policy section "${Section_Title}" (${Policy_Type}) created for ${tenantId || 'global default'}`, req,
    });

    return sendSuccess(res, row, 'Policy section created.', 201);
  } catch (err) {
    console.error('Create policy error:', err.message);
    return sendError(res, 500, 'Failed to create policy section.');
  }
});

// ─── PUT /api/policies/:id ─────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const tenantId = resolveTenantId(req);
  const { Policy_Type, Section_Title, Section_Content, Sort_Order, Is_Active } = req.body;

  if (Policy_Type !== undefined && !VALID_TYPES.includes(Policy_Type)) {
    return sendError(res, 400, `Policy_Type must be one of ${VALID_TYPES.join(', ')}`);
  }

  const updates = {};
  if (Policy_Type !== undefined) updates.Policy_Type = Policy_Type;
  if (Section_Title !== undefined) updates.Section_Title = Section_Title;
  if (Section_Content !== undefined) updates.Section_Content = Section_Content;
  if (Sort_Order !== undefined) updates.Sort_Order = Sort_Order;
  if (Is_Active !== undefined) updates.Is_Active = Is_Active;
  updates.Updated_Date = db.fn.now();

  try {
    const where = tenantId ? { Policy_ID: req.params.id, Tenant_ID: tenantId } : { Policy_ID: req.params.id, Tenant_ID: null };
    const [row] = await db('tbl_scheme_policies').where(where).update(updates).returning('*');
    if (!row) return sendError(res, 404, 'Policy section not found.');
    return sendSuccess(res, row, 'Policy section updated.');
  } catch (err) {
    return sendError(res, 500, 'Failed to update policy section.');
  }
});

// ─── DELETE /api/policies/:id ───────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const tenantId = resolveTenantId(req);
  try {
    const where = tenantId ? { Policy_ID: req.params.id, Tenant_ID: tenantId } : { Policy_ID: req.params.id, Tenant_ID: null };
    const count = await db('tbl_scheme_policies').where(where).del();
    if (!count) return sendError(res, 404, 'Policy section not found.');
    return sendSuccess(res, null, 'Policy section deleted.');
  } catch (err) {
    return sendError(res, 500, 'Failed to delete policy section.');
  }
});

module.exports = router;
