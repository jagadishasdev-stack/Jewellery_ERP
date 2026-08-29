/**
 * A returned sale shares the same Payment_Status='Cancelled' as an
 * outright-cancelled one (deliberate — every existing report/query that
 * already excludes Cancelled sales correctly excludes returns too), but
 * that meant there was no timestamp recording WHEN a return actually
 * happened — needed for the Running Stock formula's new Sales Return
 * component to attribute it to the right date range.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('tbl_sales_header', (t) => {
    t.timestamp('Returned_Date');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('tbl_sales_header', (t) => {
    t.dropColumn('Returned_Date');
  });
};
