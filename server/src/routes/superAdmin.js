/**
 * Super Admin Routes — Master Database View
 * Real-time store stats, global search, tenant overview
 */
const router = require('express').Router();
const db = require('../db/knex');
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate, requireSuperAdmin, invalidateTenantStatus } = require('../middleware/auth');
const { STANDARD_ACTIONS, DEFAULT_SHORTCUTS, resolveShortcuts, isValidCombo } = require('../utils/shortcuts');
const dayjs = require('dayjs');

// ─── Refresh stats for all tenants (called periodically or on demand) ─────────
const refreshAllTenantStats = async () => {
  const tenants = await db('tbl_tenant_master')
    .where('Is_Active', true)
    .whereNot('Tenant_ID', 'SA_MASTER')
    .select('Tenant_ID');

  const today = dayjs().format('YYYY-MM-DD');

  for (const { Tenant_ID } of tenants) {
    try {
      const [salesRow] = await db('tbl_sales_header')
        .where('Tenant_ID', Tenant_ID)
        .whereRaw(`DATE("Sale_Date") = ?`, [today])
        .whereNot('Payment_Status', 'Cancelled')
        .select(
          db.raw('COUNT(*) AS cnt'),
          db.raw('COALESCE(SUM("Net_Payable_Amount"), 0) AS amt')
        );

      const [stockRow] = await db('tbl_ornament_master')
        .where({ Tenant_ID, Is_Active: true, Is_Sold: false })
        .select(db.raw('COALESCE(SUM("Total_Price"), 0) AS val'));

      const [userRow] = await db('tbl_session_master')
        .where({ Tenant_ID, Is_Active: true })
        .whereRaw(`"Last_Activity" > NOW() - INTERVAL '30 minutes'`)
        .count('Session_ID as cnt');

      await db('tbl_tenant_master').where('Tenant_ID', Tenant_ID).update({
        Today_Sales_Amount: parseFloat(salesRow?.amt || 0),
        Today_Sales_Count: parseInt(salesRow?.cnt || 0),
        Stock_Value: parseFloat(stockRow?.val || 0),
        Active_User_Count: parseInt(userRow?.cnt || 0),
        Last_Stats_Updated: new Date(),
      });
    } catch (err) {
      // Non-fatal — continue with other tenants
    }
  }
};

// ─── GET /api/super-admin/dashboard ───────────────────────────────────────────
router.get('/dashboard', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    await refreshAllTenantStats();

    const tenants = await db('tbl_tenant_master')
      .whereNot('Tenant_ID', 'SA_MASTER')
      .orderBy('Today_Sales_Amount', 'desc')
      .select(
        'Tenant_ID', 'Company_Name', 'City', 'State', 'Store_Type',
        'Is_Active', 'License_Expiry_Date',
        'Today_Sales_Amount', 'Today_Sales_Count',
        'Stock_Value', 'Active_User_Count', 'Last_Stats_Updated',
        'Max_Users', 'Max_Branches'
      );

    const summary = {
      total_stores: tenants.length,
      active_stores: tenants.filter(t => t.Is_Active).length,
      inactive_stores: tenants.filter(t => !t.Is_Active).length,
      expiring_soon: tenants.filter(t => {
        const days = dayjs(t.License_Expiry_Date).diff(dayjs(), 'day');
        return days >= 0 && days <= 30;
      }).length,
      expired: tenants.filter(t => dayjs(t.License_Expiry_Date).isBefore(dayjs())).length,
      today_total_sales: tenants.reduce((s, t) => s + parseFloat(t.Today_Sales_Amount || 0), 0),
      today_total_bills: tenants.reduce((s, t) => s + parseInt(t.Today_Sales_Count || 0), 0),
      total_stock_value: tenants.reduce((s, t) => s + parseFloat(t.Stock_Value || 0), 0),
      total_active_users: tenants.reduce((s, t) => s + parseInt(t.Active_User_Count || 0), 0),
    };

    return sendSuccess(res, { summary, tenants });
  } catch (err) {
    console.error('SA dashboard error:', err);
    return sendError(res, 500, 'Failed to load super admin dashboard.');
  }
});

// ─── GET /api/super-admin/search?q=STORE1001 ──────────────────────────────────
router.get('/search', authenticate, requireSuperAdmin, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return sendError(res, 400, 'Search query too short.');

  try {
    await refreshAllTenantStats();

    const tenants = await db('tbl_tenant_master')
      .where(function () {
        this.where('Tenant_ID', 'ilike', `%${q}%`)
          .orWhere('Company_Name', 'ilike', `%${q}%`)
          .orWhere('City', 'ilike', `%${q}%`)
          .orWhere('Phone', 'like', `%${q}%`)
          .orWhere('GST_No', 'ilike', `%${q}%`);
      })
      .whereNot('Tenant_ID', 'SA_MASTER')
      .select(
        'Tenant_ID', 'Company_Name', 'City', 'State', 'Store_Type',
        'Is_Active', 'License_Expiry_Date', 'Phone', 'Email', 'GST_No',
        'Today_Sales_Amount', 'Today_Sales_Count', 'Stock_Value',
        'Active_User_Count', 'Max_Users', 'Max_Branches', 'Created_Date'
      );

    // For each matched tenant, get branch count
    const results = await Promise.all(tenants.map(async (t) => {
      const [branchRow] = await db('tbl_branch_master')
        .where({ Tenant_ID: t.Tenant_ID, Is_Active: true })
        .count('Branch_ID as cnt');
      return { ...t, branch_count: parseInt(branchRow?.cnt || 0) };
    }));

    return sendSuccess(res, results);
  } catch (err) {
    console.error('SA search error:', err);
    return sendError(res, 500, 'Search failed.');
  }
});

// ─── GET /api/super-admin/tenant/:id ──────────────────────────────────────────
router.get('/tenant/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const tenantId = req.params.id;
  try {
    const tenant = await db('tbl_tenant_master').where('Tenant_ID', tenantId).first();
    if (!tenant) return sendError(res, 404, 'Tenant not found.');

    const [branches] = [await db('tbl_branch_master').where('Tenant_ID', tenantId)];
    const [userCount] = await db('tbl_user_master').where({ Tenant_ID: tenantId, Is_Active: true }).count('User_ID as cnt');
    const [stockCount] = await db('tbl_ornament_master').where({ Tenant_ID: tenantId, Is_Active: true, Is_Sold: false }).count('Ornament_ID as cnt');

    const today = dayjs().format('YYYY-MM-DD');
    const todaySales = await db('tbl_sales_header')
      .where('Tenant_ID', tenantId)
      .whereRaw(`DATE("Sale_Date") = ?`, [today])
      .select(
        db.raw('COUNT(*) AS bills'),
        db.raw('COALESCE(SUM("Net_Payable_Amount"), 0) AS revenue'),
        db.raw('COALESCE(SUM("GST_Amount"), 0) AS gst')
      )
      .first();

    const license = await db('tbl_license_master').where('Tenant_ID', tenantId).orderBy('Expiry_Date', 'desc').first();
    const todayRate = await db('tbl_tenant_rates').where('Tenant_ID', tenantId).orderBy('Rate_Date', 'desc').first();

    return sendSuccess(res, {
      tenant,
      branches,
      branch_count: branches.length,
      user_count: parseInt(userCount?.cnt || 0),
      stock_count: parseInt(stockCount?.cnt || 0),
      today_sales: todaySales,
      license,
      today_gold_rate: todayRate,
    });
  } catch (err) {
    return sendError(res, 500, 'Failed to load tenant details.');
  }
});

// ─── PUT /api/super-admin/tenant/:id/store-type ────────────────────────────────
router.put('/tenant/:id/store-type', authenticate, requireSuperAdmin, async (req, res) => {
  const { store_type } = req.body;
  if (!['Retailer', 'Wholesaler', 'Manufacturer', 'Hybrid'].includes(store_type)) {
    return sendError(res, 400, 'Invalid store type.');
  }
  try {
    await db('tbl_tenant_master').where('Tenant_ID', req.params.id).update({ Store_Type: store_type });
    return sendSuccess(res, null, `Store type updated to ${store_type}.`);
  } catch (err) {
    return sendError(res, 500, 'Failed to update store type.');
  }
});

// ─── PUT /api/super-admin/tenant/:id/settings — Edit tenant details ───────────
// Includes AMC/license control: Is_Active (immediate lockout — see
// invalidateTenantStatus below and middleware/auth.js's per-request status
// check) and License_Expiry_Date (renewal — previously only settable at
// tenant creation, with no way to extend it afterward at all).
router.put('/tenant/:id/settings', authenticate, requireSuperAdmin, async (req, res) => {
  const allowed = ['Company_Name','City','State','GST_No','Phone','Email','Website',
    'Max_Users','Max_Branches','Is_Active','Notes','Business_Type',
    'Address_Line1','Address_Line2','Pincode','Short_Number_Format','Include_Branch_In_Numbering','License_Expiry_Date',
    'License_Mode'];
  if (req.body.License_Mode !== undefined && !['TENANT_WIDE', 'PER_DEVICE'].includes(req.body.License_Mode)) {
    return sendError(res, 400, "License_Mode must be 'TENANT_WIDE' or 'PER_DEVICE'.");
  }
  const update = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
  update.Modified_Date = new Date();
  try {
    const [updated] = await db('tbl_tenant_master')
      .where('Tenant_ID', req.params.id)
      .update(update)
      .returning('*');
    if (!updated) return sendError(res, 404, 'Tenant not found.');
    // Is_Active / License_Expiry_Date changes must take effect on this
    // tenant's very next request, not up to STATUS_CACHE_TTL_MS later.
    if ('Is_Active' in update || 'License_Expiry_Date' in update) {
      invalidateTenantStatus(req.params.id);
    }
    return sendSuccess(res, updated, 'Tenant updated.');
  } catch (err) {
    console.error('Tenant update error:', err.message);
    return sendError(res, 500, 'Failed to update tenant.');
  }
});

// ─── GET /api/super-admin/tenant/:id/payment-gateway ───────────────────────────
// Lists the tenant's configured payment gateways (Razorpay/PhonePe/etc).
// Key_Secret is never sent to the client — masked to its last 4 characters
// only, same principle as never round-tripping it through the mobile app.
router.get('/tenant/:id/payment-gateway', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const rows = await db('tbl_payment_gateway_config').where({ Tenant_ID: req.params.id });
    const webhookUrlFor = (gateway) => gateway === 'razorpay'
      ? `${process.env.PUBLIC_SERVER_URL || `${req.protocol}://${req.get('host')}`}/api/webhooks/razorpay/${req.params.id}`
      : null;
    const masked = rows.map((r) => ({
      configId: r.Config_ID,
      gateway: r.Gateway,
      keyId: r.Key_ID,
      keySecretMasked: r.Key_Secret ? `••••${r.Key_Secret.slice(-4)}` : null,
      webhookSecretMasked: r.Webhook_Secret ? `••••${r.Webhook_Secret.slice(-4)}` : null,
      merchantId: r.Merchant_ID,
      environment: r.Environment,
      isActive: r.Is_Active,
      // Not stored — the exact URL to paste into Razorpay's own dashboard
      // (Settings → Webhooks) for this tenant. Same value every time for a
      // given gateway+tenant, computed rather than persisted so it always
      // reflects wherever this server is actually reachable from.
      webhookUrl: webhookUrlFor(r.Gateway),
    }));
    // No row yet at all for razorpay (brand new tenant) — still hand back a
    // virtual entry so the admin UI has something to build a form around,
    // and can show the webhook URL even before the first save.
    if (!masked.some((m) => m.gateway === 'razorpay')) {
      masked.push({
        configId: null, gateway: 'razorpay', keyId: null, keySecretMasked: null,
        webhookSecretMasked: null, merchantId: null, environment: 'test', isActive: true,
        webhookUrl: webhookUrlFor('razorpay'),
      });
    }
    return sendSuccess(res, masked);
  } catch (err) {
    console.error('payment-gateway list error:', err.message);
    return sendError(res, 500, 'Failed to fetch payment gateway config.');
  }
});

// ─── PUT /api/super-admin/tenant/:id/payment-gateway — set a gateway's creds ───
// Upserts one row per (Tenant_ID, Gateway). Body: { gateway, keyId, keySecret,
// merchantId, environment, isActive }. keySecret is optional on an update —
// omit it to change other fields (environment, isActive) without having to
// re-paste the secret every time.
router.put('/tenant/:id/payment-gateway', authenticate, requireSuperAdmin, async (req, res) => {
  const { gateway, keyId, keySecret, webhookSecret, merchantId, saltKey, saltIndex, environment, isActive } = req.body;
  if (!gateway) return sendError(res, 400, 'gateway is required (e.g. "razorpay").');

  try {
    const tenant = await db('tbl_tenant_master').where({ Tenant_ID: req.params.id }).first();
    if (!tenant) return sendError(res, 404, 'Tenant not found.');

    const existing = await db('tbl_payment_gateway_config')
      .where({ Tenant_ID: req.params.id, Gateway: gateway }).first();

    const update = {
      Tenant_ID: req.params.id,
      Gateway: gateway,
      Environment: environment || existing?.Environment || 'test',
      Is_Active: isActive !== undefined ? isActive : (existing?.Is_Active ?? true),
      Created_By: req.user.username,
    };
    if (keyId !== undefined) update.Key_ID = keyId;
    if (keySecret !== undefined && keySecret !== '') update.Key_Secret = keySecret;
    if (webhookSecret !== undefined && webhookSecret !== '') update.Webhook_Secret = webhookSecret;
    if (merchantId !== undefined) update.Merchant_ID = merchantId;
    if (saltKey !== undefined) update.Salt_Key = saltKey;
    if (saltIndex !== undefined) update.Salt_Index = saltIndex;

    let row;
    if (existing) {
      [row] = await db('tbl_payment_gateway_config')
        .where({ Config_ID: existing.Config_ID }).update(update).returning('*');
    } else {
      [row] = await db('tbl_payment_gateway_config').insert(update).returning('*');
    }

    const { auditLog } = require('../utils/auditLogger');
    await auditLog({
      tenantId: req.params.id, userId: req.user.userId,
      tableName: 'tbl_payment_gateway_config', recordId: row.Config_ID,
      actionType: existing ? 'UPDATE' : 'INSERT',
      description: `Payment gateway "${gateway}" ${existing ? 'updated' : 'configured'} for ${req.params.id} (env: ${update.Environment}).`,
      req,
    });

    return sendSuccess(res, {
      configId: row.Config_ID, gateway: row.Gateway, keyId: row.Key_ID,
      keySecretMasked: row.Key_Secret ? `••••${row.Key_Secret.slice(-4)}` : null,
      webhookSecretMasked: row.Webhook_Secret ? `••••${row.Webhook_Secret.slice(-4)}` : null,
      merchantId: row.Merchant_ID, environment: row.Environment, isActive: row.Is_Active,
      webhookUrl: row.Gateway === 'razorpay'
        ? `${process.env.PUBLIC_SERVER_URL || `${req.protocol}://${req.get('host')}`}/api/webhooks/razorpay/${req.params.id}`
        : null,
    }, existing ? 'Payment gateway updated.' : 'Payment gateway configured.');
  } catch (err) {
    console.error('payment-gateway upsert error:', err.message);
    return sendError(res, 500, 'Failed to save payment gateway config.');
  }
});

// ─── GET /api/super-admin/tenant/:id/shortcuts — SA views a tenant's keys ──────
router.get('/tenant/:id/shortcuts', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const row = await db('tbl_tenant_shortcuts').where({ Tenant_ID: req.params.id }).first();
    return sendSuccess(res, { resolved: resolveShortcuts(row?.Shortcuts), overrides: row?.Shortcuts || {}, defaults: DEFAULT_SHORTCUTS });
  } catch (err) {
    return sendError(res, 500, 'Failed to load shortcuts.');
  }
});

// ─── PUT /api/super-admin/tenant/:id/shortcuts — SA remaps a tenant's keys ─────
// Every user of that tenant picks up the new keys immediately (the
// frontend refetches GET /api/tenant/shortcuts on login/periodically —
// see ShortcutContext.jsx), no per-user step needed.
router.put('/tenant/:id/shortcuts', authenticate, requireSuperAdmin, async (req, res) => {
  const overrides = req.body.overrides || {};
  const badKeys = Object.keys(overrides).filter((k) => !STANDARD_ACTIONS.includes(k));
  if (badKeys.length) return sendError(res, 400, `Unknown action(s): ${badKeys.join(', ')}. Valid: ${STANDARD_ACTIONS.join(', ')}.`);
  const badCombos = Object.entries(overrides).filter(([, v]) => !isValidCombo(v));
  if (badCombos.length) return sendError(res, 400, `Invalid key combo for: ${badCombos.map(([k]) => k).join(', ')}. Use e.g. "Ctrl+F", "Alt+N", "F10".`);

  try {
    const tenant = await db('tbl_tenant_master').where({ Tenant_ID: req.params.id }).first();
    if (!tenant) return sendError(res, 404, 'Tenant not found.');

    const existing = await db('tbl_tenant_shortcuts').where({ Tenant_ID: req.params.id }).first();
    const payload = { Shortcuts: JSON.stringify(overrides), Updated_By: req.user.username, Updated_Date: new Date() };
    if (existing) {
      await db('tbl_tenant_shortcuts').where({ Tenant_ID: req.params.id }).update(payload);
    } else {
      await db('tbl_tenant_shortcuts').insert({ Tenant_ID: req.params.id, ...payload });
    }

    const { auditLog } = require('../utils/auditLogger');
    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId,
      tableName: 'tbl_tenant_shortcuts', recordId: req.params.id, actionType: 'UPDATE',
      description: `SA ${req.user.username} updated shortcut keys for tenant ${req.params.id}: ${JSON.stringify(overrides)}`,
      req,
    });

    return sendSuccess(res, resolveShortcuts(overrides), `Shortcut keys updated for ${req.params.id}.`);
  } catch (err) {
    console.error('SA shortcut update error:', err.message);
    return sendError(res, 500, 'Failed to update shortcuts.');
  }
});

// ─── POST /api/super-admin/tenant-module-toggle — SA toggles module for tenant ─
router.post('/tenant-module-toggle', authenticate, requireSuperAdmin, async (req, res) => {
  const { tenantId, moduleKey, enabled } = req.body;
  if (!tenantId || !moduleKey || typeof enabled !== 'boolean') {
    return sendError(res, 400, 'tenantId, moduleKey, and enabled required.');
  }
  try {
    const mod = await db('tbl_erp_modules').where('Module_Key', moduleKey).first();
    if (!mod) return sendError(res, 404, 'Module not found.');
    if (mod.Is_Core && !enabled) return sendError(res, 400, `"${mod.Module_Name}" is a core module and cannot be disabled.`);

    const existing = await db('tbl_tenant_modules').where({ Tenant_ID: tenantId, Module_Key: moduleKey }).first();
    if (existing) {
      await db('tbl_tenant_modules').where({ Tenant_ID: tenantId, Module_Key: moduleKey })
        .update({ Is_Enabled: enabled, Enabled_By: req.user.username, Enabled_Date: new Date() });
    } else {
      await db('tbl_tenant_modules').insert({
        Tenant_ID: tenantId, Module_Key: moduleKey,
        Is_Enabled: enabled, Enabled_By: req.user.username,
      });
    }

    const { auditLog } = require('../utils/auditLogger');
    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId,
      tableName: 'tbl_tenant_modules', recordId: `${tenantId}:${moduleKey}`,
      actionType: 'UPDATE',
      description: `SA ${req.user.username} ${enabled ? 'ENABLED' : 'DISABLED'} module "${mod.Module_Name}" for tenant ${tenantId}`,
      req,
    });

    return sendSuccess(res, { tenantId, moduleKey, enabled }, `Module "${mod.Module_Name}" ${enabled ? 'enabled' : 'disabled'} for ${tenantId}.`);
  } catch (err) {
    console.error('SA module toggle error:', err.message);
    return sendError(res, 500, 'Failed to toggle module.');
  }
});

// ─── POST /api/super-admin/tenant-provision — SA re-provisions tenant modules ──
router.post('/tenant-provision', authenticate, requireSuperAdmin, async (req, res) => {
  const { tenantId, businessType } = req.body;
  const validTypes = ['RETAILER', 'WHOLESALER', 'MANUFACTURER', 'HYBRID'];
  if (!tenantId || !validTypes.includes(businessType)) {
    return sendError(res, 400, 'tenantId and valid businessType required.');
  }
  try {
    const btColMap = { RETAILER: 'Default_Retailer', WHOLESALER: 'Default_Wholesaler', MANUFACTURER: 'Default_Manufacturer', HYBRID: 'Default_Hybrid' };
    const btCol = btColMap[businessType];

    // Update business type on tenant
    await db('tbl_tenant_master').where('Tenant_ID', tenantId).update({ Business_Type: businessType });

    // Re-provision all modules
    const allModules = await db('tbl_erp_modules');
    await db('tbl_tenant_modules').where('Tenant_ID', tenantId).del();

    const rows = allModules.map(m => ({
      Tenant_ID: tenantId,
      Module_Key: m.Module_Key,
      Is_Enabled: m.Is_Core ? true : !!m[btCol],
      Enabled_By: req.user.username,
    }));

    await db('tbl_tenant_modules').insert(rows);

    const { auditLog } = require('../utils/auditLogger');
    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId,
      tableName: 'tbl_tenant_modules', recordId: tenantId,
      actionType: 'UPDATE',
      description: `SA ${req.user.username} changed business type of ${tenantId} to ${businessType} and re-provisioned modules`,
      req,
    });

    const enabled = rows.filter(r => r.Is_Enabled).map(r => r.Module_Key);
    return sendSuccess(res, { tenantId, businessType, enabledModules: enabled },
      `${tenantId} re-provisioned as ${businessType}. ${enabled.length} modules enabled.`);
  } catch (err) {
    console.error('SA provision error:', err.message);
    return sendError(res, 500, 'Failed to provision modules.');
  }
});

// ─── GET /api/super-admin/tenant/:id/users — SA views all users of a tenant ──
router.get('/tenant/:id/users', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const users = await db('tbl_user_master as u')
      .join('tbl_role_master as r', 'u.Role_ID', 'r.Role_ID')
      .where('u.Tenant_ID', req.params.id)
      .orderBy('u.Full_Name')
      .select(
        'u.User_ID', 'u.Username', 'u.Full_Name', 'u.Email', 'u.Mobile',
        'u.Is_Active', 'u.Is_Admin', 'u.Last_Login_Date', 'u.Created_Date',
        'u.Role_ID', 'u.Login_Attempts', 'u.Locked_Until', 'u.Employee_Code',
        'u.Default_Password',   // SA-only: initial/last-set plain-text password
        'r.Role_Name'
      );
    return sendSuccess(res, users);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch tenant users.');
  }
});

// ─── PUT /api/super-admin/tenant/:tenantId/users/:userId/reset-password ────────
// Super Admin sets a new password for any tenant user
router.put('/tenant/:tenantId/users/:userId/reset-password', authenticate, requireSuperAdmin, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return sendError(res, 400, 'Password must be at least 6 characters.');
  }
  try {
    // Verify user belongs to the given tenant
    const user = await db('tbl_user_master')
      .where({ User_ID: req.params.userId, Tenant_ID: req.params.tenantId })
      .first();
    if (!user) return sendError(res, 404, 'User not found in this tenant.');

    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(newPassword, salt);

    await db('tbl_user_master')
      .where({ User_ID: req.params.userId })
      .update({
        Password_Hash: hash,
        Password_Salt: salt,
        // Default_Password intentionally not written — see auth.js's note
        // near its own Default_Password write. You (the person resetting
        // it) already know newPassword right now; there's no need to be
        // able to read it back from the database later.
        Login_Attempts: 0,
        Locked_Until: null,
        Modified_Date: new Date(),
      });

    const { auditLog } = require('../utils/auditLogger');
    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId,
      tableName: 'tbl_user_master', recordId: req.params.userId,
      actionType: 'UPDATE',
      description: `SA ${req.user.username} reset password for user "${user.Username}" in tenant ${req.params.tenantId}`,
      req,
    });

    return sendSuccess(res, null, `Password reset for user "${user.Username}".`);
  } catch (err) {
    console.error('SA password reset error:', err.message);
    return sendError(res, 500, 'Failed to reset password.');
  }
});

// ─── PUT /api/super-admin/tenant/:tenantId/users/:userId — SA edits tenant user
router.put('/tenant/:tenantId/users/:userId', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const user = await db('tbl_user_master')
      .where({ User_ID: req.params.userId, Tenant_ID: req.params.tenantId })
      .first();
    if (!user) return sendError(res, 404, 'User not found.');

    const { Password, ...updateData } = req.body;
    delete updateData.Password_Hash;
    delete updateData.Password_Salt;
    delete updateData.Tenant_ID;
    updateData.Modified_Date = new Date();

    await db('tbl_user_master')
      .where({ User_ID: req.params.userId })
      .update(updateData);

    return sendSuccess(res, null, 'User updated.');
  } catch (err) {
    return sendError(res, 500, 'Failed to update user.');
  }
});
router.get('/tenant/:id/modules', authenticate, requireSuperAdmin, async (req, res) => {
  const tenantId = req.params.id;
  try {
    const tenant = await db('tbl_tenant_master').where('Tenant_ID', tenantId).first();
    if (!tenant) return sendError(res, 404, 'Tenant not found.');

    const btColMap = { RETAILER: 'Default_Retailer', WHOLESALER: 'Default_Wholesaler', MANUFACTURER: 'Default_Manufacturer', HYBRID: 'Default_Hybrid' };
    const btCol = btColMap[tenant.Business_Type] || 'Default_Hybrid';

    const modules = await db('tbl_erp_modules as m')
      .leftJoin('tbl_tenant_modules as tm', function () {
        this.on('m.Module_Key', 'tm.Module_Key').andOn('tm.Tenant_ID', db.raw('?', [tenantId]));
      })
      .select(
        'm.*',
        db.raw(`COALESCE(tm."Is_Enabled", m."${btCol}") as "Is_Enabled"`),
        'tm.Enabled_By', 'tm.Enabled_Date',
      )
      .orderBy('m.Sort_Order');

    return sendSuccess(res, modules);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch tenant modules.');
  }
});

// ─── GET /api/super-admin/tenant/:id/savings-summary — Savings Club counts ─────
router.get('/tenant/:id/savings-summary', authenticate, requireSuperAdmin, async (req, res) => {
  const tenantId = req.params.id;
  try {
    const [memberRow]  = await db('tbl_scheme_members').where({ Tenant_ID: tenantId, Status: 'Active' }).count('Member_ID as cnt');
    const [groupRow]   = await db('tbl_scheme_groups').where({ Tenant_ID: tenantId }).count('Group_ID as cnt');
    const [agentRow]   = await db('tbl_agent_master').where({ Tenant_ID: tenantId, Status: 'Active' }).count('Agent_ID as cnt');

    const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
    const [collectionRow] = await db('tbl_scheme_transactions')
      .where({ Tenant_ID: tenantId, Txn_Type: 'Collection' })
      .where('Payment_Date', '>=', monthStart)
      .select(db.raw('COUNT(*) AS cnt'), db.raw('COALESCE(SUM("Net_Amount"), 0) AS amt'));

    return sendSuccess(res, {
      activeMembers: parseInt(memberRow?.cnt || 0),
      totalGroups: parseInt(groupRow?.cnt || 0),
      activeAgents: parseInt(agentRow?.cnt || 0),
      monthCollectionCount: parseInt(collectionRow?.cnt || 0),
      monthCollectionAmount: parseFloat(collectionRow?.amt || 0),
    });
  } catch (err) {
    console.error('SA savings summary error:', err.message);
    return sendError(res, 500, 'Failed to load Savings Club summary.');
  }
});

// ─── POST /api/super-admin/tenant/:id/agents — SA creates an agent for a tenant
router.post('/tenant/:id/agents', authenticate, requireSuperAdmin, async (req, res) => {
  const tenantId = req.params.id;
  const { Agent_Name, Mobile } = req.body;
  if (!Agent_Name?.trim()) return sendError(res, 400, 'Agent name required.');
  if (!/^\d{10}$/.test(Mobile || '')) return sendError(res, 400, 'Valid 10-digit mobile required.');

  try {
    const tenant = await db('tbl_tenant_master').where('Tenant_ID', tenantId).first();
    if (!tenant) return sendError(res, 404, 'Tenant not found.');

    const existing = await db('tbl_agent_master').where({ Tenant_ID: tenantId, Mobile }).first();
    if (existing) return sendError(res, 409, 'Mobile number already registered as agent for this tenant.');

    // Agent_Code has a GLOBAL unique constraint (not scoped per tenant) —
    // generating it from only this tenant's own count collides the moment
    // a second tenant creates their first agent (confirmed for real: this
    // exact "AGT1"-style collision blocked TEST_TENANT here). Prefixing
    // with the tenant ID, matching the other two agent-creation paths.
    const last = await db('tbl_agent_master').where('Tenant_ID', tenantId).orderBy('Agent_ID', 'desc').first();
    const seq = last ? parseInt((last.Agent_Code || '').replace(/\D/g, '')) + 1 : 1001;
    const agentCode = req.body.Agent_Code || `AGT-${tenantId.replace('_', '')}-${String(seq).padStart(5, '0')}`;

    const [agent] = await db('tbl_agent_master').insert({
      ...req.body,
      Tenant_ID: tenantId,
      Agent_Code: agentCode,
      Status: req.body.Status || 'Active',
      Created_By: req.user.username,
    }).returning('*');

    const { auditLog } = require('../utils/auditLogger');
    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_agent_master',
      recordId: agent.Agent_ID, actionType: 'INSERT',
      description: `SA ${req.user.username} created agent "${Agent_Name}" for tenant ${tenantId}`, req,
    });

    return sendSuccess(res, agent, 'Agent created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Agent code already exists.');
    console.error('SA create agent error:', err.message);
    return sendError(res, 500, 'Failed to create agent.');
  }
});

// ─── POST /api/super-admin/tenant/:id/users — SA creates an admin/user for a tenant
router.post('/tenant/:id/users', authenticate, requireSuperAdmin, async (req, res) => {
  const tenantId = req.params.id;
  const { Username, Password, Full_Name, Role_ID } = req.body;
  if (!Username?.trim()) return sendError(res, 400, 'Username required.');
  if (!Password || Password.length < 8) return sendError(res, 400, 'Password must be at least 8 characters.');
  if (!Full_Name?.trim()) return sendError(res, 400, 'Full name required.');
  if (!Number.isInteger(Role_ID)) return sendError(res, 400, 'Role required.');

  try {
    const tenant = await db('tbl_tenant_master').where('Tenant_ID', tenantId).first();
    if (!tenant) return sendError(res, 404, 'Tenant not found.');

    const bcrypt = require('bcryptjs');
    const { Password: _pw, ...userData } = req.body;
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(Password, salt);

    // Multi-Branch Management — same default rule as the tenant's own
    // POST /api/tenant/users: a Client Admin sees every branch by default,
    // anyone else needs explicit grants. See utils/branchAccess.js.
    let allBranchAccess = req.body.All_Branch_Access;
    if (allBranchAccess === undefined) {
      const role = await db('tbl_role_master').where({ Role_ID }).first('Role_Name');
      allBranchAccess = role?.Role_Name === 'Client Admin';
    }

    const [user] = await db('tbl_user_master').insert({
      ...userData,
      Tenant_ID: tenantId,
      Password_Hash: hash,
      Password_Salt: salt,
      // Default_Password intentionally not written — see auth.js's note.
      All_Branch_Access: allBranchAccess,
      Is_Active: req.body.Is_Active !== undefined ? req.body.Is_Active : true,
      Created_By: req.user.username,
    }).returning(['User_ID', 'Username', 'Full_Name', 'Email', 'Is_Active']);

    const { auditLog } = require('../utils/auditLogger');
    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_user_master',
      recordId: user.User_ID, actionType: 'INSERT',
      description: `SA ${req.user.username} created user "${Username}" for tenant ${tenantId}`, req,
    });

    return sendSuccess(res, user, 'User created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Username already exists.');
    console.error('SA create user error:', err.message);
    return sendError(res, 500, 'Failed to create user.');
  }
});

module.exports = router;
