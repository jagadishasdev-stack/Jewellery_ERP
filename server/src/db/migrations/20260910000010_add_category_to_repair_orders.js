/**
 * Repair Category master (tbl_repair_category_master, added in the prior
 * migration) had nowhere in the actual Repair module to be used — this
 * links it onto the job-card table. Nullable and SET NULL on delete: an
 * existing repair order must never break, or get silently deleted, just
 * because someone later deactivates/removes a category.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('tbl_repair_orders', (t) => {
    t.integer('Category_ID').references('Category_ID').inTable('tbl_repair_category_master').onDelete('SET NULL');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('tbl_repair_orders', (t) => { t.dropColumn('Category_ID'); });
};
