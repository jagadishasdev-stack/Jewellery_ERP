/**
 * Branch Orders — a branch REQUESTING stock it needs (pull model), the
 * opposite direction from the existing tbl_stock_transfer (push: the
 * source branch initiates, picks items, destination approves to
 * receive). Genuinely absent before — additive, doesn't touch
 * tbl_stock_transfer's schema; a fulfilled request links to a real
 * transfer via Transfer_ID rather than duplicating the transfer logic.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('tbl_branch_order_request', (t) => {
    t.increments('Request_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Request_Number', 30).unique().notNullable();
    t.string('Requesting_Branch_ID', 20).notNullable().references('Branch_ID').inTable('tbl_branch_master').onDelete('CASCADE');
    t.string('Source_Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.integer('Type_ID').references('Type_ID').inTable('tbl_item_type_master').onDelete('SET NULL');
    t.integer('Design_ID').references('Design_ID').inTable('tbl_design_master').onDelete('SET NULL');
    t.string('Metal_Type', 20).notNullable();
    t.decimal('Requested_Weight', 10, 3);
    t.integer('Requested_Quantity').defaultTo(1);
    // Requested -> Approved (source branch picked, fulfilling separately
    // via the real tbl_stock_transfer flow) -> Transferred (linked to a
    // real Transfer_ID once that transfer completes) | Rejected | Cancelled.
    t.string('Status', 20).defaultTo('Requested');
    t.bigInteger('Transfer_ID').references('Transfer_ID').inTable('tbl_stock_transfer').onDelete('SET NULL');
    t.text('Notes');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.string('Approved_By', 50);
    t.timestamp('Approved_Date');
    t.index(['Tenant_ID', 'Status'], 'idx_branch_order_request_status');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tbl_branch_order_request');
};
