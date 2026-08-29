/**
 * Ready Order Purchase — procurement triggered by a customer order.
 * Rather than building a parallel purchase/procurement system, this
 * reuses the existing Order Bin (tbl_bin_orders) and Purchase
 * (tbl_purchase_header) tables that already separately handle order
 * tracking and procurement — just adds the one link between them that
 * was missing, plus a QC gate before an order can be marked Ready.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('tbl_bin_orders', (t) => {
    t.bigInteger('Related_Purchase_ID').references('Purchase_ID').inTable('tbl_purchase_header').onDelete('SET NULL');
    t.boolean('QC_Passed').defaultTo(false);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('tbl_bin_orders', (t) => {
    t.dropColumn('Related_Purchase_ID');
    t.dropColumn('QC_Passed');
  });
};
