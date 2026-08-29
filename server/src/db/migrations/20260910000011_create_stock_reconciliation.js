/**
 * Stock Reconciliation / physical count — confirmed genuinely missing by
 * the Master/Reports/Utility audit (no table, no route, anywhere). Scoped
 * deliberately conservative on the variance question: a count is entered
 * as a Draft first, every item's variance (counted vs system) is fully
 * visible for review, and stock is ONLY ever adjusted by an explicit,
 * separate "Apply" action — never automatically the moment a count is
 * saved. This mirrors the Approval Issue/Receipt pattern already used
 * elsewhere in this codebase for anything that changes real stock
 * quantities, rather than inventing a new, riskier one-step flow.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('tbl_stock_reconciliation', (t) => {
    t.increments('Recon_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Recon_Number', 30).notNullable();
    t.date('Recon_Date').notNullable();
    t.string('Status', 20).notNullable().defaultTo('Draft'); // Draft, Applied
    t.text('Notes');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.string('Applied_By', 50);
    t.timestamp('Applied_Date');
    t.unique(['Tenant_ID', 'Recon_Number']);
  });

  await knex.schema.createTable('tbl_stock_reconciliation_items', (t) => {
    t.increments('Item_ID').primary();
    t.integer('Recon_ID').notNullable().references('Recon_ID').inTable('tbl_stock_reconciliation').onDelete('CASCADE');
    t.integer('Ornament_ID').notNullable().references('Ornament_ID').inTable('tbl_ornament_master').onDelete('CASCADE');
    // Snapshotted at count-entry time — the system quantity at the moment
    // it was counted, not a live re-read at Apply time, so a variance
    // review always reflects what was actually seen during the count.
    t.integer('System_Quantity').notNullable();
    t.integer('Counted_Quantity').notNullable();
    t.integer('Variance').notNullable(); // Counted - System, computed at insert
    t.text('Remarks');
    t.unique(['Recon_ID', 'Ornament_ID']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tbl_stock_reconciliation_items');
  await knex.schema.dropTableIfExists('tbl_stock_reconciliation');
};
