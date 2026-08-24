/**
 * The Master Bin sidebar group (Purchase/Sales Return/Order/Pure Gold Bin)
 * was the only major nav section in the whole app with zero module gating
 * — every tenant saw all 4 unconditionally, business type and subscription
 * tier notwithstanding. Reported directly: a tenant clicking a bin they
 * don't actually use has no way to hide it, cluttering the sidebar.
 *
 * All 4 default to enabled for every business type — this is purely
 * additive, nothing disappears for anyone until an admin explicitly turns
 * one off from Module Management, exactly like every other optional module.
 */
exports.up = async function (knex) {
  const modules = [
    { Module_Key: 'bin_purchase',      Module_Name: 'Purchase Bin',      Sort_Order: 47 },
    { Module_Key: 'bin_sales_return',  Module_Name: 'Sales Return Bin',  Sort_Order: 48 },
    { Module_Key: 'bin_orders',        Module_Name: 'Order Bin',         Sort_Order: 49 },
    { Module_Key: 'bin_pure_gold',     Module_Name: 'Pure Gold Bin',     Sort_Order: 50 },
  ];
  for (const m of modules) {
    const existing = await knex('tbl_erp_modules').where('Module_Key', m.Module_Key).first();
    if (!existing) {
      await knex('tbl_erp_modules').insert({
        ...m, Module_Group: 'Bin Management', Is_Core: false,
        Default_Retailer: true, Default_Wholesaler: true, Default_Manufacturer: true, Default_Hybrid: true,
      });
    }
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').whereIn('Module_Key', [
    'bin_purchase', 'bin_sales_return', 'bin_orders', 'bin_pure_gold',
  ]).del();
};
