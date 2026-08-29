/**
 * Jobcard Prediction — manufacturing planning (customer, design, metal,
 * expected weight/completion, karigar, material requirement, estimated
 * wastage/making) that deliberately does NOT touch real stock/production
 * tables. Genuinely absent before — the only "Jobcard" concept in the
 * codebase was Repair's own service job cards (an unrelated, already
 * stock-affecting workflow).
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('tbl_jobcard_prediction', (t) => {
    t.increments('Jobcard_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Jobcard_Number', 30).unique().notNullable();
    t.integer('Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('SET NULL');
    t.integer('Design_ID').references('Design_ID').inTable('tbl_design_master').onDelete('SET NULL');
    t.string('Metal_Type', 20).notNullable();
    t.integer('Karigar_ID').references('Vendor_ID').inTable('tbl_vendor_master').onDelete('SET NULL');
    t.decimal('Expected_Weight', 10, 3);
    t.date('Expected_Completion_Date');
    t.decimal('Estimated_Wastage_Pct', 5, 2);
    t.decimal('Estimated_Making_Charge', 10, 2);
    t.text('Material_Requirement');
    // Draft/Confirmed are pure planning states. Converted just records
    // that a real production/order was later created for this prediction
    // elsewhere — it does NOT auto-create or link one; that would risk
    // this "prediction" quietly becoming an actual stock-affecting
    // transaction, which is exactly what the spec says it must not do.
    t.string('Status', 20).defaultTo('Draft');
    t.text('Notes');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Status'], 'idx_jobcard_prediction_status');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tbl_jobcard_prediction');
};
