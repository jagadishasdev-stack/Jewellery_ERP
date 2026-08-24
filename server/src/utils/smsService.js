/**
 * SMS Service — sends DLT-compliant transactional SMS via a configurable
 * gateway (currently Asterix Technology's GET-based submitsms.jsp API).
 * Config/templates are stored per-tenant in tbl_sms_gateway_config /
 * tbl_sms_templates; a Tenant_ID = NULL row is the global fallback used
 * when a tenant has no config of its own.
 */
const db = require('../db/knex');

/**
 * Look up gateway config for a tenant, falling back to the global default.
 */
const getGatewayConfig = async (tenantId) => {
  const config = tenantId
    ? await db('tbl_sms_gateway_config')
        .where({ Tenant_ID: tenantId, Is_Active: true })
        .first()
    : null;
  if (config) return config;
  return db('tbl_sms_gateway_config').whereNull('Tenant_ID').where({ Is_Active: true }).first();
};

/**
 * Look up the DLT template for a purpose, falling back to the global default.
 */
const getTemplate = async (tenantId, purpose) => {
  const template = tenantId
    ? await db('tbl_sms_templates')
        .where({ Tenant_ID: tenantId, Purpose: purpose, Is_Active: true })
        .first()
    : null;
  if (template) return template;
  return db('tbl_sms_templates')
    .whereNull('Tenant_ID')
    .where({ Purpose: purpose, Is_Active: true })
    .first();
};

/**
 * Send an SMS for a given purpose (e.g. 'OTP'), substituting `variables`
 * into the DLT template text. Variables are literal placeholder tokens in
 * the template, e.g. { '<OTP>': '234789' } — the substituted text must
 * match the DLT-registered template exactly except for the variable slots.
 *
 * Never throws — logs to tbl_sms_log and returns { success, error? }.
 *
 * @param {object} opts
 * @param {string} [opts.tenantId]
 * @param {string} opts.mobile
 * @param {string} opts.purpose      - e.g. 'OTP'
 * @param {object} opts.variables    - e.g. { '<OTP>': '234789' }
 */
const sendSms = async ({ tenantId, mobile, purpose, variables = {} }) => {
  let message = '';
  try {
    const [gateway, template] = await Promise.all([
      getGatewayConfig(tenantId),
      getTemplate(tenantId, purpose),
    ]);

    if (!gateway || !template) {
      console.warn(`[SMS] No gateway/template configured for purpose=${purpose}, tenant=${tenantId || 'default'} — skipping send.`);
      return { success: false, error: 'not_configured' };
    }

    message = template.Template_Text;
    for (const [token, value] of Object.entries(variables)) {
      message = message.split(token).join(value);
    }

    const url = new URL(gateway.Api_Base_Url);
    url.searchParams.set('user', gateway.Api_User);
    url.searchParams.set('key', gateway.Api_Key);
    url.searchParams.set('mobile', mobile);
    url.searchParams.set('message', message);
    url.searchParams.set('senderid', gateway.Sender_Id);
    url.searchParams.set('accusage', gateway.Account_Usage || '1');
    url.searchParams.set('entityid', gateway.Entity_Id);
    url.searchParams.set('tempid', template.Dlt_Template_Id);

    const res = await fetch(url.toString(), { method: 'GET', signal: AbortSignal.timeout(10000) });
    const responseText = await res.text();

    await db('tbl_sms_log').insert({
      Tenant_ID: tenantId || null,
      Mobile: mobile,
      Purpose: purpose,
      Message: message,
      Status: res.ok ? 'Sent' : 'Failed',
      Provider_Response: responseText.slice(0, 2000),
    });

    if (!res.ok) {
      console.error(`[SMS] Gateway returned ${res.status} for ${mobile}:`, responseText);
      return { success: false, error: responseText };
    }
    return { success: true, response: responseText };
  } catch (err) {
    console.error('[SMS] Send error (non-fatal):', err.message);
    try {
      await db('tbl_sms_log').insert({
        Tenant_ID: tenantId || null,
        Mobile: mobile,
        Purpose: purpose,
        Message: message,
        Status: 'Failed',
        Provider_Response: err.message,
      });
    } catch { /* logging failure is non-fatal too */ }
    return { success: false, error: err.message };
  }
};

module.exports = { sendSms };
