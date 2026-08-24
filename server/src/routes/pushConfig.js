/**
 * Push Notification (Firebase Admin SDK) configuration — Super Admin only.
 * Same reasoning as smsConfig.js: the service account key is a real
 * external credential best kept under one team's oversight rather than
 * delegated to each shop's local admin.
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
const { sendPushNotification, invalidatePushApp } = require('../utils/pushNotificationService');

router.use(authenticate, requireSuperAdmin);

const resolveTenantId = (req) => {
  const q = req.query.tenantId;
  return (!q || q === 'null') ? null : q;
};

// Never send the real service account JSON to a browser — it contains a
// private key. Masked to just the client_email, which is enough to tell
// configs apart without exposing the key.
const maskConfig = (row) => row && {
  ...row,
  Service_Account_JSON: undefined,
  Client_Email_Hint: (() => {
    try { return JSON.parse(row.Service_Account_JSON).client_email; } catch { return null; }
  })(),
};

// ─── GET /api/push-config/config ───────────────────────────────────────────
// Returns the tenant's own config, falling back to the global default.
router.get('/config', async (req, res) => {
  const tenantId = resolveTenantId(req);
  try {
    const own = tenantId
      ? await db('tbl_push_notification_config').where({ Tenant_ID: tenantId }).first()
      : await db('tbl_push_notification_config').whereNull('Tenant_ID').first();
    if (own) return sendSuccess(res, { ...maskConfig(own), isOwnConfig: true });

    const fallback = await db('tbl_push_notification_config').whereNull('Tenant_ID').first();
    return sendSuccess(res, fallback ? { ...maskConfig(fallback), isOwnConfig: false } : null);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch push notification config.');
  }
});

// ─── PUT /api/push-config/config ───────────────────────────────────────────
// Creates or updates the tenant's own row (or the global row, for Super
// Admin explicitly editing tenantId=null). Service_Account_JSON is
// required — unlike the SMS gateway's Api_Key, there's no safe partial
// update here: Project_ID is derived FROM the JSON, so a save always
// replaces the whole credential together.
router.put('/config', [
  body('Service_Account_JSON').custom((value) => {
    let parsed;
    try { parsed = JSON.parse(value); } catch { throw new Error('Not valid JSON.'); }
    if (parsed.type !== 'service_account') throw new Error('Not a Firebase service-account key (expected "type": "service_account").');
    if (!parsed.project_id || !parsed.private_key || !parsed.client_email) {
      throw new Error('Missing project_id / private_key / client_email — paste the full downloaded JSON file, not an excerpt.');
    }
    return true;
  }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const tenantId = resolveTenantId(req);
  const { Service_Account_JSON, Is_Active } = req.body;
  const projectId = JSON.parse(Service_Account_JSON).project_id;

  try {
    const existing = tenantId
      ? await db('tbl_push_notification_config').where({ Tenant_ID: tenantId }).first()
      : await db('tbl_push_notification_config').whereNull('Tenant_ID').first();

    const payload = {
      Provider: 'firebase',
      Project_ID: projectId,
      Service_Account_JSON,
      Is_Active: Is_Active !== false,
      Updated_Date: db.fn.now(),
    };

    let row;
    if (existing) {
      [row] = await db('tbl_push_notification_config').where({ Config_ID: existing.Config_ID }).update(payload).returning('*');
      await invalidatePushApp(existing.Config_ID); // old cached app used the previous key — drop it
    } else {
      [row] = await db('tbl_push_notification_config').insert({ ...payload, Tenant_ID: tenantId }).returning('*');
    }

    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_push_notification_config',
      recordId: row.Config_ID, actionType: existing ? 'UPDATE' : 'INSERT',
      description: `Push notification config saved for ${tenantId || 'global default'} (project: ${projectId})`, req,
    });

    return sendSuccess(res, maskConfig(row), 'Push notification config saved.');
  } catch (err) {
    console.error('Save push config error:', err.message);
    return sendError(res, 500, 'Failed to save push notification config.');
  }
});

// ─── POST /api/push-config/test-send ───────────────────────────────────────
// Sends one real push to a device token, using this tenant's resolved
// config (own or fallback) — the only way to actually confirm a pasted
// service account key works, short of a live end-to-end app test.
router.post('/test-send', [
  body('deviceToken').trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const tenantId = resolveTenantId(req);
  const result = await sendPushNotification({
    tenantId,
    deviceToken: req.body.deviceToken,
    purpose: 'TEST',
    title: 'Test notification',
    body: 'If you can see this, the Firebase config for this tenant is working.',
  });

  if (!result.success) return sendError(res, 400, `Send failed: ${result.error}`);
  return sendSuccess(res, result, 'Test notification sent.');
});

// ─── GET /api/push-config/log ───────────────────────────────────────────────
// Recent send attempts for this tenant (debugging delivery issues).
router.get('/log', async (req, res) => {
  const tenantId = resolveTenantId(req);
  try {
    let qb = db('tbl_push_log').orderBy('Created_Date', 'desc').limit(100);
    qb = tenantId ? qb.where({ Tenant_ID: tenantId }) : qb.whereNull('Tenant_ID');
    return sendSuccess(res, await qb);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch push notification log.');
  }
});

module.exports = router;
