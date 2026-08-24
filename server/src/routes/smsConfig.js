/**
 * SMS Gateway + Template configuration — Super Admin only. Managed
 * centrally rather than self-service per tenant, since Sender ID / DLT
 * Entity ID / template IDs are compliance-sensitive DLT registrations
 * best kept under one team's oversight rather than delegated to each
 * shop's local admin.
 *
 * Every request must specify ?tenantId= (a real tenant, or 'null'/omitted
 * for the global default fallback row used until a tenant gets its own).
 * A save always writes/creates a tenant-specific row — it never edits the
 * global default row when a real tenantId is given.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { auditLog } = require('../utils/auditLogger');

router.use(authenticate, requireSuperAdmin);

const resolveTenantId = (req) => {
  const q = req.query.tenantId;
  return (!q || q === 'null') ? null : q;
};

// Never send the real Api_Key to a browser — same principle applied to the
// payment-gateway config (see superAdmin.js). Masked to its last 4 chars.
const maskConfig = (row) => row && {
  ...row,
  Api_Key: undefined,
  Api_Key_Masked: row.Api_Key ? `••••${row.Api_Key.slice(-4)}` : null,
};

// ─── GET /api/sms-config/gateway-config ───────────────────────────────────────
// Returns the tenant's own config, falling back to the global default.
router.get('/gateway-config', async (req, res) => {
  const tenantId = resolveTenantId(req);
  try {
    const own = tenantId
      ? await db('tbl_sms_gateway_config').where({ Tenant_ID: tenantId }).first()
      : await db('tbl_sms_gateway_config').whereNull('Tenant_ID').first();
    if (own) return sendSuccess(res, { ...maskConfig(own), isOwnConfig: true });

    const fallback = await db('tbl_sms_gateway_config').whereNull('Tenant_ID').first();
    return sendSuccess(res, fallback ? { ...maskConfig(fallback), isOwnConfig: false } : null);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch SMS gateway config.');
  }
});

// ─── PUT /api/sms-config/gateway-config ───────────────────────────────────────
// Creates or updates the tenant's own row (or the global row, for Super Admin
// explicitly editing tenantId=null). Never falls through to editing someone
// else's row. Api_Key is optional on an update — omit it to change other
// fields (Sender_Id, Is_Active, ...) without having to re-paste the real
// secret every time; it's required when there's no existing row to fall
// back on.
router.put('/gateway-config', [
  body('Provider').trim().notEmpty(),
  body('Api_Base_Url').trim().isURL({ require_tld: false }),
  body('Api_User').trim().notEmpty(),
  body('Sender_Id').trim().notEmpty(),
  body('Entity_Id').trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const tenantId = resolveTenantId(req);
  const { Provider, Api_Base_Url, Api_User, Api_Key, Sender_Id, Entity_Id, Account_Usage, Is_Active } = req.body;

  try {
    const existing = tenantId
      ? await db('tbl_sms_gateway_config').where({ Tenant_ID: tenantId }).first()
      : await db('tbl_sms_gateway_config').whereNull('Tenant_ID').first();

    if (!existing && !Api_Key) return sendError(res, 400, 'Api_Key is required for a new config.');

    const payload = {
      Provider, Api_Base_Url, Api_User, Sender_Id, Entity_Id,
      Account_Usage: Account_Usage || '1',
      Is_Active: Is_Active !== false,
      Updated_Date: db.fn.now(),
    };
    if (Api_Key) payload.Api_Key = Api_Key;

    let row;
    if (existing) {
      [row] = await db('tbl_sms_gateway_config').where({ Config_ID: existing.Config_ID }).update(payload).returning('*');
    } else {
      [row] = await db('tbl_sms_gateway_config').insert({ ...payload, Tenant_ID: tenantId }).returning('*');
    }

    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_sms_gateway_config',
      recordId: row.Config_ID, actionType: existing ? 'UPDATE' : 'INSERT',
      description: `SMS gateway config saved for ${tenantId || 'global default'}`, req,
    });

    return sendSuccess(res, maskConfig(row), 'SMS gateway config saved.');
  } catch (err) {
    console.error('Save SMS gateway config error:', err.message);
    return sendError(res, 500, 'Failed to save SMS gateway config.');
  }
});

// ─── GET /api/sms-config/templates ────────────────────────────────────────────
// Returns the tenant's own templates merged with global defaults for any
// purpose the tenant hasn't overridden.
router.get('/templates', async (req, res) => {
  const tenantId = resolveTenantId(req);
  try {
    const globalTemplates = await db('tbl_sms_templates').whereNull('Tenant_ID');
    const ownTemplates = tenantId
      ? await db('tbl_sms_templates').where({ Tenant_ID: tenantId })
      : [];

    const byPurpose = new Map();
    globalTemplates.forEach(t => byPurpose.set(t.Purpose, { ...t, isOwnConfig: false }));
    ownTemplates.forEach(t => byPurpose.set(t.Purpose, { ...t, isOwnConfig: true }));

    return sendSuccess(res, Array.from(byPurpose.values()));
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch SMS templates.');
  }
});

// ─── POST /api/sms-config/templates ───────────────────────────────────────────
// Creates/updates the selected tenant's template for a purpose (upsert on
// Tenant_ID+Purpose). tenantId=null edits the global default template.
router.post('/templates', [
  body('Purpose').trim().notEmpty(),
  body('Dlt_Template_Id').trim().notEmpty(),
  body('Template_Text').trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const tenantId = resolveTenantId(req);
  const { Purpose, Dlt_Template_Id, Template_Text, Is_Active } = req.body;

  try {
    const existing = tenantId
      ? await db('tbl_sms_templates').where({ Tenant_ID: tenantId, Purpose }).first()
      : await db('tbl_sms_templates').whereNull('Tenant_ID').where({ Purpose }).first();

    const payload = { Purpose, Dlt_Template_Id, Template_Text, Is_Active: Is_Active !== false };

    let row;
    if (existing) {
      [row] = await db('tbl_sms_templates').where({ Template_ID: existing.Template_ID }).update(payload).returning('*');
    } else {
      [row] = await db('tbl_sms_templates').insert({ ...payload, Tenant_ID: tenantId }).returning('*');
    }

    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_sms_templates',
      recordId: row.Template_ID, actionType: existing ? 'UPDATE' : 'INSERT',
      description: `SMS template "${Purpose}" saved for ${tenantId || 'global default'}`, req,
    });

    return sendSuccess(res, row, 'SMS template saved.');
  } catch (err) {
    console.error('Save SMS template error:', err.message);
    return sendError(res, 500, 'Failed to save SMS template.');
  }
});

// ─── GET /api/sms-config/log ───────────────────────────────────────────────────
// Recent send attempts for this tenant (debugging delivery issues).
router.get('/log', async (req, res) => {
  const tenantId = resolveTenantId(req);
  try {
    let qb = db('tbl_sms_log').orderBy('Created_Date', 'desc').limit(100);
    qb = tenantId ? qb.where({ Tenant_ID: tenantId }) : qb.whereNull('Tenant_ID');
    return sendSuccess(res, await qb);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch SMS log.');
  }
});

module.exports = router;
