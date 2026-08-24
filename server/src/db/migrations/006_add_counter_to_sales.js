/**
 * Migration 006: Add Counter tracking to sales and sessions
 * Enables multi-counter POS — each billing window is a separate counter
 */
exports.up = async function (knex) {
  // Add Counter fields to tbl_sales_header
  await knex.schema.alterTable('tbl_sales_header', (t) => {
    t.integer('Counter_ID').nullable();          // FK to tbl_counter_master
    t.string('Counter_Name', 50).nullable();     // Denormalized for fast reports
    t.string('Operator_Name', 100).nullable();   // Who processed this sale
  });

  // Add Counter field to tbl_session_master
  await knex.schema.alterTable('tbl_session_master', (t) => {
    t.integer('Counter_ID').nullable();
    t.string('Counter_Name', 50).nullable();
    t.string('Counter_Window_ID', 50).nullable(); // UUID for the browser window
  });

  // Index for counter-based reporting
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_sales_counter ON tbl_sales_header("Tenant_ID", "Counter_ID")'
  );
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_sales_header', (t) => {
    t.dropColumn('Counter_ID');
    t.dropColumn('Counter_Name');
    t.dropColumn('Operator_Name');
  });
  await knex.schema.alterTable('tbl_session_master', (t) => {
    t.dropColumn('Counter_ID');
    t.dropColumn('Counter_Name');
    t.dropColumn('Counter_Window_ID');
  });
};
