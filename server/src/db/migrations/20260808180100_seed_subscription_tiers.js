/**
 * Gold / Platinum / Diamond subscription tiers.
 *
 * This is a SECOND, independent gating dimension on top of business type
 * (Retailer/Wholesaler/Manufacturer/Hybrid, already fully implemented via
 * tbl_erp_modules.Default_* + tbl_tenant_modules overrides — see
 * GET /api/modules/tenant-context). A tenant's final module list is the
 * INTERSECTION of both: a Wholesaler on the Gold plan sees neither
 * Manufacturer-only screens (business type) nor Platinum/Diamond-only
 * screens (tier), even though Wholesaler's business-type defaults would
 * otherwise include some of them.
 *
 * Features_JSON is the definitive list of Module_Keys each tier unlocks —
 * cumulative, so Platinum's array already includes everything Gold has,
 * and Diamond's includes everything Platinum has. Edit these arrays
 * directly in tbl_subscription_plan_master to change what a tier includes;
 * no code change needed for that.
 *
 * See TIER_FEATURE_MAPPING.md at the repo root for the full reasoning
 * behind which module maps to which tier, and which of the originally
 * requested bullet points (e.g. "API integrations", "Priority support")
 * aren't real toggleable app screens at all.
 *
 * Prices/limits below are placeholders — adjust to your actual pricing via
 * tbl_subscription_plan_master directly, nothing else depends on the exact
 * numbers.
 */
const GOLD_MODULES = [
  'dashboard', 'masters', 'inventory', 'barcode', 'retail_sales', 'wholesale_sales',
  'estimate', 'order_booking', 'sales_return', 'purchase', 'old_gold', 'customers',
  'accounts', 'reports', 'settings',
];

const PLATINUM_ADDITIONS = [
  'stock_transfer', 'floors', 'goldsmith', 'manufacturing', 'job_work', 'gst_reports',
  'day_close', 'savings_scheme', 'digi_gold', 'lucky_draw', 'sms_whatsapp_integration',
  'user_permission_overrides', 'bank_cheque', 'dealers', 'repair',
];

const DIAMOND_ADDITIONS = [
  'approval_module', 'invoice_studio', 'pawnbroking', 'insurance_amc', 'hr_payroll',
  'crm', 'rate_booking_agent_commission', 'hsn_einvoice_loyalty', 'manufacturing_bom',
  'guarantor_certification', 'reorder_rfid_card_charges', 'tally_bridge', 'sync_engine',
  'advanced_analytics_dashboard', 'audit_logs', 'payment_gateway_integration',
];

const PLATINUM_MODULES = [...GOLD_MODULES, ...PLATINUM_ADDITIONS];
const DIAMOND_MODULES = [...PLATINUM_MODULES, ...DIAMOND_ADDITIONS];

exports.up = async function (knex) {
  const plans = [
    {
      Plan_Name: 'Gold', Monthly_Price: 999, Annual_Price: 9999,
      Max_Users: 3, Max_Branches: 1, Max_Devices: 3,
      Features_JSON: JSON.stringify(GOLD_MODULES),
    },
    {
      Plan_Name: 'Platinum', Monthly_Price: 2499, Annual_Price: 24999,
      Max_Users: 10, Max_Branches: 5, Max_Devices: 10,
      Features_JSON: JSON.stringify(PLATINUM_MODULES),
    },
    {
      Plan_Name: 'Diamond', Monthly_Price: 4999, Annual_Price: 49999,
      Max_Users: 50, Max_Branches: 999, Max_Devices: 50,
      Features_JSON: JSON.stringify(DIAMOND_MODULES),
    },
  ];
  for (const plan of plans) {
    const existing = await knex('tbl_subscription_plan_master').where('Plan_Name', plan.Plan_Name).first();
    if (!existing) await knex('tbl_subscription_plan_master').insert(plan);
  }
};

exports.down = async function (knex) {
  await knex('tbl_subscription_plan_master').whereIn('Plan_Name', ['Gold', 'Platinum', 'Diamond']).del();
};
