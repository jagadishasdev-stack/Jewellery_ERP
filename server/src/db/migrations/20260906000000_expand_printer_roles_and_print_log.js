/**
 * Printer Setup & Document Printing Management — closing the gap where
 * only 3 printer "roles" existed (thermal_label/thermal_receipt/regular)
 * against the spec's 9 document types (Quotation, Sales Bill, Purchase
 * Bill, Barcode, Receipt, Credit Note, Debit Note, Reports, Other).
 *
 * 1. Renames the 3 existing Printer_Role values to their new-scheme
 *    equivalents, in place, so any printer a tenant already configured
 *    keeps working under the new role name rather than silently
 *    reverting to "unassigned":
 *      thermal_label   -> barcode
 *      thermal_receipt -> receipt
 *      regular         -> other
 *    (No data existed in dev at migration-authoring time, but this is
 *    written as a real rename for whatever's in production, not a
 *    destructive drop/recreate.)
 *
 * 2. New tbl_print_log — Print History (spec §23): one row per actual
 *    print attempt (including Test Print), so "my bill never printed"
 *    is answerable — which printer, which user, when, and whether it
 *    actually succeeded.
 */
exports.up = async function (knex) {
  await knex('tbl_printer_config').where({ Printer_Role: 'thermal_label' }).update({ Printer_Role: 'barcode' });
  await knex('tbl_printer_config').where({ Printer_Role: 'thermal_receipt' }).update({ Printer_Role: 'receipt' });
  await knex('tbl_printer_config').where({ Printer_Role: 'regular' }).update({ Printer_Role: 'other' });

  await knex.schema.createTable('tbl_print_log', (t) => {
    t.increments('Log_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Printer_Role', 20).notNullable(); // one of the 9 roles below, or 'test'
    t.string('Document_Type', 40); // e.g. 'Sales Bill', 'Barcode', 'Test Print'
    t.string('Document_Number', 60); // invoice/voucher number, null for a Test Print
    t.string('Printer_Name', 150).notNullable();
    t.string('Status', 15).notNullable(); // 'Success' | 'Failed'
    t.text('Error_Message');
    t.string('Printed_By', 50);
    t.timestamp('Printed_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Printed_Date'], 'idx_print_log_tenant_date');
    t.index(['Tenant_ID', 'Document_Number'], 'idx_print_log_document');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_print_log');
  await knex('tbl_printer_config').where({ Printer_Role: 'barcode' }).update({ Printer_Role: 'thermal_label' });
  await knex('tbl_printer_config').where({ Printer_Role: 'receipt' }).update({ Printer_Role: 'thermal_receipt' });
  await knex('tbl_printer_config').where({ Printer_Role: 'other' }).update({ Printer_Role: 'regular' });
};
