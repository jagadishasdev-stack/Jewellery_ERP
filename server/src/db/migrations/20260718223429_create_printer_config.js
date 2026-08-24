/**
 * Printer configuration — which OS-registered printer (as reported by the
 * QZ Tray bridge running on the billing PC) should be used for each kind of
 * print job. One row per Tenant_ID (+ optional Branch_ID) + Printer_Role.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_printer_config', (t) => {
    t.increments('Config_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('CASCADE');
    t.string('Printer_Role', 20).notNullable(); // 'thermal_label' | 'thermal_receipt' | 'regular'
    t.string('Printer_Name', 150).notNullable(); // exact OS printer name, as reported by QZ Tray
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Updated_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Branch_ID', 'Printer_Role'], 'idx_printer_config_lookup');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_printer_config');
};
