/**
 * Metal Transaction ledger — a real running balance per metal type
 * (Opening/Addition/Issue/Receipt/Conversion/Closing), upgrading Pure
 * Gold Bin's previous single-entry holding-record-with-a-status-flag
 * into an actual ledger. Additive: tbl_bin_pure_gold is untouched and
 * still works exactly as before — this is a parallel ledger that Pure
 * Gold Bin's create/dispose actions also write to, plus manual entries
 * for movements that don't go through the bin at all.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('tbl_metal_transaction_ledger', (t) => {
    t.increments('Ledger_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Metal_Type', 20).notNullable();
    t.string('Transaction_Type', 20).notNullable(); // Opening, Addition, Issue, Receipt, Conversion, Closing
    // Signed — Addition/Receipt/Opening are positive, Issue/Conversion-out
    // are negative. Balance_After is denormalized (computed once at
    // insert time, not recomputed on read) — the same pattern this
    // codebase's own accounting ledger already uses.
    t.decimal('Weight_Change', 12, 3).notNullable();
    t.decimal('Balance_After', 12, 3).notNullable();
    t.decimal('Purity', 5, 2);
    t.string('Reference_Type', 40); // e.g. 'PURE_GOLD_BIN'
    t.integer('Reference_ID');
    t.text('Notes');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Metal_Type', 'Created_Date'], 'idx_metal_ledger_lookup');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tbl_metal_transaction_ledger');
};
