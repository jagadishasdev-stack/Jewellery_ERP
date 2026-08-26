/**
 * Loyalty points only ever accrued (1 point per ₹1,000 spent, hardcoded
 * in sales.js) — there was no way to redeem them for a discount on a new
 * sale anywhere in the app, and no rupee value per point existed to make
 * that math possible. Per-tenant rather than a hardcoded global rate, so
 * each business can set their own program cost.
 */
exports.up = function (knex) {
  return knex.schema.alterTable('tbl_tenant_master', (t) => {
    t.decimal('Loyalty_Point_Value', 6, 2).notNullable().defaultTo(1.00);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('tbl_tenant_master', (t) => {
    t.dropColumn('Loyalty_Point_Value');
  });
};
