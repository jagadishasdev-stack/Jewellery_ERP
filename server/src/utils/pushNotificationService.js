/**
 * Push Notification Service — sends Firebase Cloud Messaging (FCM) push
 * notifications via a per-tenant Firebase Admin SDK service account.
 * Config is stored per-tenant in tbl_push_notification_config; a
 * Tenant_ID = NULL row is the global fallback used when a tenant has no
 * config of its own — same pattern as smsService.js.
 *
 * Each tenant's Firebase Admin app is initialized lazily and cached (a
 * service account can only be used to initialize ONE admin.App instance
 * per unique name — re-initializing on every send would throw).
 */
const admin = require('firebase-admin');
const db = require('../db/knex');

const appCache = new Map(); // Config_ID -> admin.App

/**
 * Look up push config for a tenant, falling back to the global default.
 */
const getGatewayConfig = async (tenantId) => {
  const config = tenantId
    ? await db('tbl_push_notification_config')
        .where({ Tenant_ID: tenantId, Is_Active: true })
        .first()
    : null;
  if (config) return config;
  return db('tbl_push_notification_config').whereNull('Tenant_ID').where({ Is_Active: true }).first();
};

/**
 * Returns a cached (or freshly initialized) Firebase Admin app for this
 * config row. Throws if Service_Account_JSON doesn't parse or isn't a
 * valid service account — callers should catch and log via tbl_push_log,
 * never let a bad config crash the caller's own request.
 */
const getFirebaseApp = (config) => {
  if (appCache.has(config.Config_ID)) return appCache.get(config.Config_ID);

  const serviceAccount = JSON.parse(config.Service_Account_JSON);
  const app = admin.initializeApp(
    { credential: admin.credential.cert(serviceAccount) },
    `push-config-${config.Config_ID}`, // named app — default app stays untouched
  );
  appCache.set(config.Config_ID, app);
  return app;
};

/**
 * Send a push notification to one device token.
 *
 * Never throws — logs to tbl_push_log and returns { success, error? }.
 *
 * @param {object} opts
 * @param {string} [opts.tenantId]
 * @param {string} opts.deviceToken - the recipient's FCM registration token
 * @param {string} [opts.purpose]   - e.g. 'TEST', 'COLLECTION_REMINDER'
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {object} [opts.data]      - optional custom key/value payload
 */
const sendPushNotification = async ({ tenantId, deviceToken, purpose = 'GENERAL', title, body, data = {} }) => {
  try {
    const config = await getGatewayConfig(tenantId);
    if (!config) {
      console.warn(`[Push] No config configured for tenant=${tenantId || 'default'} — skipping send.`);
      return { success: false, error: 'not_configured' };
    }

    const app = getFirebaseApp(config);
    const messageId = await admin.messaging(app).send({
      token: deviceToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])), // FCM data payload must be string-valued
    });

    await db('tbl_push_log').insert({
      Tenant_ID: tenantId || null, Device_Token: deviceToken, Purpose: purpose,
      Title: title, Body: body, Status: 'Sent', Provider_Response: messageId,
    });

    return { success: true, messageId };
  } catch (err) {
    console.error('[Push] Send error (non-fatal):', err.message);
    try {
      await db('tbl_push_log').insert({
        Tenant_ID: tenantId || null, Device_Token: deviceToken, Purpose: purpose,
        Title: title, Body: body, Status: 'Failed', Provider_Response: err.message,
      });
    } catch { /* logging failure is non-fatal too */ }
    return { success: false, error: err.message };
  }
};

/**
 * Drop a cached Firebase Admin app so the next send re-initializes from
 * the current DB row — call this right after saving new/changed
 * credentials for a config, otherwise the old cached app (and its old
 * key) keeps being used until the server restarts.
 */
const invalidatePushApp = async (configId) => {
  const app = appCache.get(configId);
  if (!app) return;
  appCache.delete(configId);
  try { await app.delete(); } catch { /* already gone, fine */ }
};

module.exports = { sendPushNotification, getGatewayConfig, invalidatePushApp };
