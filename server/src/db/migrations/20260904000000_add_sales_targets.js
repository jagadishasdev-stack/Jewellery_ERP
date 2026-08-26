/**
 * ManagementReportsPage.jsx's Target vs Achievement / Sales Targets tabs
 * had hardcoded mock numbers (₹10L sales, ₹8L collection) with a comment
 * admitting it ("Mock targets for now") and a UI message claiming they
 * were "configurable in Admin → Settings → Sales Targets" — a page/
 * setting that never existed anywhere in the app. Real, per-tenant,
 * editable targets now.
 */
exports.up = function (knex) {
  return knex.schema.alterTable('tbl_tenant_master', (t) => {
    t.decimal('Monthly_Sales_Target', 15, 2).nullable();
    t.decimal('Monthly_Collection_Target', 15, 2).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('tbl_tenant_master', (t) => {
    t.dropColumn('Monthly_Sales_Target');
    t.dropColumn('Monthly_Collection_Target');
  });
};
