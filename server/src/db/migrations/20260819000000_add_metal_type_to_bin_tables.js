/**
 * The 4 bin-management tables (tbl_bin_purchase, tbl_bin_sales_return,
 * tbl_bin_orders, tbl_bin_pure_gold) only ever had a free-text Purity
 * field — no real Metal_Type. binManagement.js's move-to-stock routes
 * worked around this by pattern-matching Purity text at conversion time
 * (inferMetalTypeFromPurityText — SIL-prefix -> Silver, PLAT-prefix ->
 * Platinum, else Gold), which is a runtime guess, not a real fact captured
 * at entry. This adds a real Metal_Type column to all 4 (same convention
 * as tbl_ornament_master/tbl_purity_master's own Metal_Type column added
 * 20260817000000_add_metal_type_to_stock.js) so the bin entry itself
 * records what metal it actually is, at the point it's logged.
 *
 * Backfill for existing rows uses the same SIL/PLAT/else-Gold heuristic
 * against each table's own Purity text — best-effort, same caveat as the
 * stock backfill: any pre-existing loose-diamond bin entries land as Gold
 * and need a manual one-time correction.
 */
exports.up = async function (knex) {
  const TABLES = ['tbl_bin_purchase', 'tbl_bin_sales_return', 'tbl_bin_orders', 'tbl_bin_pure_gold'];

  for (const table of TABLES) {
    await knex.schema.alterTable(table, (t) => {
      t.string('Metal_Type', 20);
    });
    await knex(table).whereNull('Metal_Type').where('Purity', 'ilike', 'SIL%').update({ Metal_Type: 'Silver' });
    await knex(table).whereNull('Metal_Type').where('Purity', 'ilike', 'PLAT%').update({ Metal_Type: 'Platinum' });
    await knex(table).whereNull('Metal_Type').update({ Metal_Type: 'Gold' });
    await knex.schema.alterTable(table, (t) => {
      t.string('Metal_Type', 20).notNullable().defaultTo('Gold').alter();
    });
  }
};

exports.down = async function (knex) {
  const TABLES = ['tbl_bin_purchase', 'tbl_bin_sales_return', 'tbl_bin_orders', 'tbl_bin_pure_gold'];
  for (const table of TABLES) {
    await knex.schema.alterTable(table, (t) => {
      t.dropColumn('Metal_Type');
    });
  }
};
