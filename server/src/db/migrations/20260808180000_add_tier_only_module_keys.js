/**
 * Four module keys that describe real screens already in the app but had
 * no Module_Key of their own yet — they were gated purely by role
 * permission (permissions.global_master / tenant_management), never by
 * business type or (now) subscription tier:
 *   - WhatsApp/SMS integration  → /admin/sms-settings
 *   - Advanced analytics dashboard → /admin/dashboard
 *   - Audit logs → /admin/audit
 *   - Payment gateway integration → the Razorpay/PhonePe config behind
 *     tbl_payment_gateway_config, surfaced in the savings/agents flow today
 *
 * All four default to Is_Core=false, Default_*=true for every business
 * type — business type never restricted these, only the new subscription
 * tier (see 20260808180100_seed_subscription_tiers.js) does.
 */
exports.up = async function (knex) {
  const modules = [
    { Module_Key: 'sms_whatsapp_integration', Module_Name: 'WhatsApp/SMS Integration', Module_Group: 'Communication', Sort_Order: 43 },
    { Module_Key: 'advanced_analytics_dashboard', Module_Name: 'Advanced Analytics Dashboard', Module_Group: 'Reports', Sort_Order: 44 },
    { Module_Key: 'audit_logs', Module_Name: 'Audit Logs', Module_Group: 'Settings', Sort_Order: 45 },
    { Module_Key: 'payment_gateway_integration', Module_Name: 'Payment Gateway Integration', Module_Group: 'Finance', Sort_Order: 46 },
  ];
  for (const m of modules) {
    const existing = await knex('tbl_erp_modules').where('Module_Key', m.Module_Key).first();
    if (!existing) {
      await knex('tbl_erp_modules').insert({
        ...m, Is_Core: false,
        Default_Retailer: true, Default_Wholesaler: true, Default_Manufacturer: true, Default_Hybrid: true,
      });
    }
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').whereIn('Module_Key', [
    'sms_whatsapp_integration', 'advanced_analytics_dashboard', 'audit_logs', 'payment_gateway_integration',
  ]).del();
};
