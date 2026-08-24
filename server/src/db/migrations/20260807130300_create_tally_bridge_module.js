/**
 * Tally accounting bridge.
 *
 * Legacy `tally_import`/`tally_log`/`tally_stkgroup`/`tally_stkitem`/
 * `tally_unit` — the business keeps using Tally alongside this ERP, so
 * this stays a *sync log*, not a replacement for Tally itself: every
 * voucher/ledger/stock-item push (or pull) gets one row here recording
 * what was sent, its Tally-side GUID, and whether it succeeded. The actual
 * chart-of-accounts/stock-group mapping (legacy tally_stkgroup/stkitem/unit)
 * lives in Tally_Config.Mapping_JSON rather than three more master tables —
 * it's small, tenant-specific, and changes rarely enough that a jsonb blob
 * is a better fit than a fully normalized side-schema no other module reads.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_tally_config', (t) => {
    t.increments('Config_ID').primary();
    t.string('Tenant_ID', 20).notNullable().unique().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Tally_Company_Name', 100);
    t.string('Tally_Company_GUID', 100);
    t.boolean('Sync_Enabled').defaultTo(false);
    t.string('Sync_Direction', 20).defaultTo('Export Only'); // Export Only | Bidirectional
    t.string('Server_IP', 50);
    t.integer('Server_Port').defaultTo(9000);
    t.jsonb('Mapping_JSON'); // ledger-name / stock-group / unit mapping between this ERP and Tally
    t.timestamp('Last_Sync_Date');
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tbl_tally_sync_log', (t) => {
    t.bigIncrements('Log_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Sync_Type', 20).notNullable(); // Voucher | Ledger | StockItem
    t.string('Reference_Table', 60); // e.g. tbl_sales_header, tbl_accounting_journal
    t.bigInteger('Reference_ID');
    t.string('Tally_Voucher_GUID', 100);
    t.string('Status', 20).notNullable().defaultTo('Pending'); // Pending | Synced | Failed
    t.text('Error_Message');
    t.timestamp('Synced_Date');
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Status'], 'idx_tally_sync_status');
    t.index(['Reference_Table', 'Reference_ID'], 'idx_tally_sync_reference');
  });

  const existingModule = await knex('tbl_erp_modules').where('Module_Key', 'tally_bridge').first();
  if (!existingModule) {
    await knex('tbl_erp_modules').insert({
      Module_Key: 'tally_bridge',
      Module_Name: 'Tally Accounting Bridge',
      Module_Group: 'Finance',
      Sort_Order: 39,
      Is_Core: false,
      Default_Retailer: true,
      Default_Wholesaler: true,
      Default_Manufacturer: true,
      Default_Hybrid: true,
    });
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').where('Module_Key', 'tally_bridge').del();
  await knex.schema.dropTableIfExists('tbl_tally_sync_log');
  await knex.schema.dropTableIfExists('tbl_tally_config');
};
