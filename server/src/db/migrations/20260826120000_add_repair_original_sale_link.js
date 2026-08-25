/**
 * Links a repair job card back to the ORIGINAL sale (if the item was sold
 * by this shop) so staff can see which karigar actually manufactured the
 * piece coming back for repair — the basis for karigar quality-of-work
 * analytics (repair-rate per karigar) in reports.js's karigar-performance
 * report. Nullable throughout: a repair is very often for an item the
 * customer already owned before this shop existed, which has no original
 * sale/karigar to link to at all.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_repair_orders', (t) => {
    t.string('Original_Invoice_Number', 50).nullable();
    t.integer('Original_Sale_ID').nullable();
    t.integer('Original_Ornament_ID').nullable();
    t.integer('Original_Karigar_ID').nullable();
    t.index(['Tenant_ID', 'Original_Karigar_ID'], 'idx_repair_tenant_original_karigar');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_repair_orders', (t) => {
    t.dropIndex(['Tenant_ID', 'Original_Karigar_ID'], 'idx_repair_tenant_original_karigar');
    t.dropColumn('Original_Karigar_ID');
    t.dropColumn('Original_Ornament_ID');
    t.dropColumn('Original_Sale_ID');
    t.dropColumn('Original_Invoice_Number');
  });
};
