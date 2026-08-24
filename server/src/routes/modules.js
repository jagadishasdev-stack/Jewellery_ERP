/**
 * Module Management Routes
 * - GET /api/modules          → all modules with tenant enabled state
 * - PUT /api/modules/:key     → toggle a module ON/OFF for current tenant
 * - POST /api/modules/provision → provision default modules for a business type
 */
const router = require('express').Router();
const db = require('../db/knex');
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const dayjs = require('dayjs');
const { auditLog } = require('../utils/auditLogger');

// Business type → default column mapping
const BT_COL = {
  RETAILER:     'Default_Retailer',
  WHOLESALER:   'Default_Wholesaler',
  MANUFACTURER: 'Default_Manufacturer',
  HYBRID:       'Default_Hybrid',
};

// Same pattern as invoiceStudio.js's resolveTenantId — a Super Admin can
// pass ?tenantId=<real tenant> to manage that customer's modules/business
// type/tier from the Module Management page (this whole page already
// requires global_master to even load; without this, a Super Admin could
// only ever manage their own SA_MASTER control-plane row, which isn't a
// real paying customer). Everyone else stays locked to their own tenant
// regardless of any query param, as a defense-in-depth backstop.
const isSuperAdmin = (req) => req.user?.roleName === 'Super Admin';
const resolveTenantId = (req) => {
  const q = req.query.tenantId;
  if (isSuperAdmin(req) && q) return q;
  return req.user.tenantId;
};

/**
 * Subscription tier (Gold/Platinum/Diamond) — a SECOND, independent gating
 * dimension on top of business type. Returns the tenant's tier module-key
 * allowlist, or `null` if the tenant has no active subscription assigned
 * yet — `null` means "don't restrict," so existing tenants that predate
 * this feature keep working exactly as before until someone explicitly
 * assigns them a plan (see PUT /api/modules/tier/:tenantId).
 */
async function getTierModules(tenantId) {
  const sub = await db('tbl_tenant_subscription as s')
    .join('tbl_subscription_plan_master as p', 's.Plan_ID', 'p.Plan_ID')
    .where('s.Tenant_ID', tenantId)
    .where('s.Status', 'Active')
    .select('p.Plan_Name', 'p.Features_JSON')
    .orderBy('s.Subscription_ID', 'desc')
    .first();
  if (!sub) return { planName: null, modules: null };
  const modules = typeof sub.Features_JSON === 'string' ? JSON.parse(sub.Features_JSON) : sub.Features_JSON;
  return { planName: sub.Plan_Name, modules };
}

// ─── GET /api/modules — All modules with this tenant's enabled state ──────────
router.get('/', authenticate, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    const modules = await db('tbl_erp_modules as m')
      .leftJoin('tbl_tenant_modules as tm', function () {
        this.on('m.Module_Key', 'tm.Module_Key').andOn('tm.Tenant_ID', db.raw('?', [tenantId]));
      })
      .select(
        'm.*',
        db.raw('COALESCE(tm."Is_Enabled", m."Default_Hybrid") as "Is_Enabled"'),
        'tm.Enabled_By', 'tm.Enabled_Date',
      )
      .orderBy('m.Sort_Order');

    const { planName, modules: tierModules } = await getTierModules(tenantId);
    const withTier = modules.map((m) => ({
      ...m,
      Is_Enabled: m.Is_Enabled && (tierModules === null || tierModules.includes(m.Module_Key)),
      Tier_Restricted: tierModules !== null && !tierModules.includes(m.Module_Key),
    }));

    return sendSuccess(res, { subscriptionTier: planName, modules: withTier });
  } catch (err) {
    console.error('Modules fetch error:', err.message);
    return sendError(res, 500, 'Failed to fetch modules.');
  }
});

// ─── GET /api/modules/tenant-context — Tenant's business type + enabled keys ──
router.get('/tenant-context', authenticate, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    const tenant = await db('tbl_tenant_master')
      .where('Tenant_ID', tenantId)
      .select('Tenant_ID', 'Company_Name', 'Business_Type')
      .first();

    const btCol = BT_COL[tenant?.Business_Type] || 'Default_Hybrid';

    // Get enabled modules: custom override OR business type default
    const modules = await db('tbl_erp_modules as m')
      .leftJoin('tbl_tenant_modules as tm', function () {
        this.on('m.Module_Key', 'tm.Module_Key').andOn('tm.Tenant_ID', db.raw('?', [tenantId]));
      })
      .select(
        'm.Module_Key', 'm.Module_Name', 'm.Module_Group', 'm.Icon', 'm.Route', 'm.Is_Core',
        db.raw(`COALESCE(tm."Is_Enabled", m."${btCol}") as "Is_Enabled"`),
      )
      .orderBy('m.Sort_Order');

    const { planName, modules: tierModules } = await getTierModules(tenantId);
    // Final visibility is business-type default/override AND tier inclusion —
    // a tenant must pass both gates, not just one, to see a module.
    const enabledKeys = modules
      .filter(m => m.Is_Enabled && (tierModules === null || tierModules.includes(m.Module_Key)))
      .map(m => m.Module_Key);

    return sendSuccess(res, {
      businessType: tenant?.Business_Type || 'HYBRID',
      companyName: tenant?.Company_Name,
      subscriptionTier: planName,
      enabledModules: enabledKeys,
      allModules: modules,
    });
  } catch (err) {
    console.error('Tenant context error:', err.message);
    return sendError(res, 500, 'Failed to fetch tenant context.');
  }
});

// ─── PUT /api/modules/:key — Toggle a module ON/OFF ───────────────────────────
router.put('/:key', authenticate, async (req, res) => {
  const { key } = req.params;
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return sendError(res, 400, 'enabled (boolean) required.');

  try {
    const tenantId = resolveTenantId(req);

    const module = await db('tbl_erp_modules').where('Module_Key', key).first();
    if (!module) return sendError(res, 404, 'Module not found.');
    if (module.Is_Core && !enabled) return sendError(res, 400, `"${module.Module_Name}" is a core module and cannot be disabled.`);

    // Upsert tbl_tenant_modules
    const existing = await db('tbl_tenant_modules').where({ Tenant_ID: tenantId, Module_Key: key }).first();
    if (existing) {
      await db('tbl_tenant_modules').where({ Tenant_ID: tenantId, Module_Key: key })
        .update({ Is_Enabled: enabled, Enabled_By: req.user.username, Enabled_Date: new Date() });
    } else {
      await db('tbl_tenant_modules').insert({
        Tenant_ID: tenantId, Module_Key: key,
        Is_Enabled: enabled, Enabled_By: req.user.username,
      });
    }

    await auditLog({
      tenantId, userId: req.user.userId,
      tableName: 'tbl_tenant_modules', recordId: key,
      actionType: 'UPDATE',
      description: `Module "${module.Module_Name}" ${enabled ? 'ENABLED' : 'DISABLED'} by ${req.user.username}`,
      oldData: { Is_Enabled: !enabled }, newData: { Is_Enabled: enabled },
      req,
    });

    return sendSuccess(res, { Module_Key: key, Is_Enabled: enabled }, `Module ${enabled ? 'enabled' : 'disabled'}.`);
  } catch (err) {
    console.error('Module toggle error:', err.message);
    return sendError(res, 500, 'Failed to toggle module.');
  }
});

// ─── POST /api/modules/provision — Set business type + provision all modules ──
router.post('/provision', authenticate, async (req, res) => {
  const { businessType } = req.body;
  const validTypes = ['RETAILER', 'WHOLESALER', 'MANUFACTURER', 'HYBRID'];
  if (!validTypes.includes(businessType)) return sendError(res, 400, `Invalid business type. Use: ${validTypes.join(', ')}`);

  try {
    const tenantId = resolveTenantId(req);
    const btCol = BT_COL[businessType];

    // Update business type on tenant
    await db('tbl_tenant_master').where('Tenant_ID', tenantId).update({ Business_Type: businessType });

    // Load all modules
    const allModules = await db('tbl_erp_modules');

    // Delete existing custom overrides and re-provision from business type defaults
    await db('tbl_tenant_modules').where('Tenant_ID', tenantId).del();

    const rows = allModules.map(m => ({
      Tenant_ID: tenantId,
      Module_Key: m.Module_Key,
      Is_Enabled: m.Is_Core ? true : !!m[btCol],
      Enabled_By: req.user.username,
    }));

    await db('tbl_tenant_modules').insert(rows);

    await auditLog({
      tenantId, userId: req.user.userId,
      tableName: 'tbl_tenant_modules', recordId: tenantId,
      actionType: 'UPDATE',
      description: `Business type changed to ${businessType} — modules re-provisioned by ${req.user.username}`,
      req,
    });

    const enabled = rows.filter(r => r.Is_Enabled).map(r => r.Module_Key);
    return sendSuccess(res, { businessType, enabledModules: enabled }, `Business type set to ${businessType}. ${enabled.length} modules enabled.`);
  } catch (err) {
    console.error('Provision error:', err.message);
    return sendError(res, 500, 'Failed to provision modules.');
  }
});

// ─── GET /api/modules/tiers — the 3 plans + what each one includes ────────────
router.get('/tiers', authenticate, async (req, res) => {
  try {
    const plans = await db('tbl_subscription_plan_master').where('Is_Active', true).orderBy('Monthly_Price');
    return sendSuccess(res, plans);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch subscription tiers.');
  }
});

// ─── PUT /api/modules/tier/:tenantId — assign/change a tenant's subscription tier ──
// Super Admin only — this is a platform-billing action, not something a
// tenant's own Client Admin should be able to grant themselves.
router.put('/tier/:tenantId', authenticate, requireSuperAdmin, async (req, res) => {
  const { tenantId } = req.params;
  const { Plan_Name, Billing_Cycle } = req.body;
  try {
    const plan = await db('tbl_subscription_plan_master').where('Plan_Name', Plan_Name).first();
    if (!plan) return sendError(res, 404, `No such plan: ${Plan_Name}. Use Gold, Platinum, or Diamond.`);

    const tenant = await db('tbl_tenant_master').where('Tenant_ID', tenantId).first();
    if (!tenant) return sendError(res, 404, 'Tenant not found.');

    // Only one Active subscription per tenant — close out any existing one.
    await db('tbl_tenant_subscription').where({ Tenant_ID: tenantId, Status: 'Active' })
      .update({ Status: 'Cancelled', End_Date: dayjs().format('YYYY-MM-DD') });

    const [sub] = await db('tbl_tenant_subscription').insert({
      Tenant_ID: tenantId, Plan_ID: plan.Plan_ID,
      Start_Date: dayjs().format('YYYY-MM-DD'),
      Billing_Cycle: Billing_Cycle || 'Monthly',
      Status: 'Active',
    }).returning('*');

    await auditLog({
      tenantId, userId: req.user.userId,
      tableName: 'tbl_tenant_subscription', recordId: sub.Subscription_ID,
      actionType: 'INSERT',
      description: `Subscription tier set to ${Plan_Name} for ${tenant.Company_Name} by ${req.user.username}`,
      req,
    });

    return sendSuccess(res, sub, `${tenant.Company_Name} is now on the ${Plan_Name} plan.`);
  } catch (err) {
    console.error('Tier assignment error:', err.message);
    return sendError(res, 500, 'Failed to assign subscription tier.');
  }
});

module.exports = router;
