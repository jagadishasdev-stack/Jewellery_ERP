/**
 * "Hide floor" fix, part 1 — a first-class marker on the sale itself.
 * Previously hidden-stock sales could only be found by joining back to
 * tbl_ornament_master.Is_Hidden (floors.js's /reports/hidden-stock-sales),
 * and could only ever be created in Unofficial mode at all (sales.js used
 * to hard-block Official-mode billing of hidden stock). Both are changing:
 * hidden stock can now be billed from either screen, so a self-contained
 * column is needed to keep Official-mode reports correctly excluding these
 * sales regardless of which screen they were actually billed from.
 */
exports.up = function (knex) {
  return knex.schema.alterTable('tbl_sales_header', (t) => {
    t.boolean('Contains_Hidden_Stock').notNullable().defaultTo(false);
    t.index(['Tenant_ID', 'Contains_Hidden_Stock'], 'idx_sales_hidden_stock');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('tbl_sales_header', (t) => {
    t.dropColumn('Contains_Hidden_Stock');
  });
};
