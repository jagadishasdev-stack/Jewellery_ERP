/**
 * Migration 011 — Enhanced Audit Log + Net Weight columns
 * Adds: Username, Full_Name, Branch_ID, Description to tbl_audit_log
 * Adds: Net_Weight column to tbl_sales_details, tbl_purchase_details
 * Adds: Net_Weight to tbl_ornament_master (alias for Net_Gold_Weight display)
 */
exports.up = async (knex) => {
  // ── Enhance tbl_audit_log ──────────────────────────────────────────────────
  const auditExists = await knex.schema.hasTable('tbl_audit_log');
  if (auditExists) {
    const cols = await knex('tbl_audit_log').columnInfo();

    if (!cols.Username) {
      await knex.schema.alterTable('tbl_audit_log', t => {
        t.string('Username', 100).nullable();
        t.string('Full_Name', 200).nullable();
        t.string('Branch_ID', 50).nullable();
        t.text('Description').nullable();
      });
    }
  } else {
    // Create fresh if doesn't exist
    await knex.schema.createTable('tbl_audit_log', t => {
      t.increments('Log_ID').primary();
      t.string('Tenant_ID', 50).nullable();
      t.integer('User_ID').nullable();
      t.string('Username', 100).nullable();
      t.string('Full_Name', 200).nullable();
      t.string('Branch_ID', 50).nullable();
      t.string('Table_Name', 100).notNullable();
      t.string('Record_ID', 100).nullable();
      t.string('Action_Type', 30).notNullable(); // INSERT/UPDATE/DELETE/VIEW/LOGIN/LOGOUT/PRINT/APPROVE
      t.text('Description').nullable();
      t.jsonb('Old_Data').nullable();
      t.jsonb('New_Data').nullable();
      t.string('IP_Address', 50).nullable();
      t.string('Device_Info', 300).nullable();
      t.timestamp('Created_Date').defaultTo(knex.fn.now());
    });
  }

  // Index for fast querying. The live table (created before this migration
  // existed) uses "Action_Timestamp", not "Created_Date" like the fresh-create
  // branch above — index whichever timestamp column this table actually has.
  const auditColsForIndex = await knex('tbl_audit_log').columnInfo();
  const timestampCol = auditColsForIndex.Created_Date ? 'Created_Date' : 'Action_Timestamp';
  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_audit_tenant_date ON tbl_audit_log("Tenant_ID", "${timestampCol}");
    CREATE INDEX IF NOT EXISTS idx_audit_user       ON tbl_audit_log("User_ID");
    CREATE INDEX IF NOT EXISTS idx_audit_action     ON tbl_audit_log("Action_Type");
    CREATE INDEX IF NOT EXISTS idx_audit_table      ON tbl_audit_log("Table_Name", "Record_ID");
  `);

  // ── Net_Weight display column on sales details ─────────────────────────────
  const sdCols = await knex('tbl_sales_details').columnInfo().catch(() => ({}));
  if (sdCols.Detail_ID && !sdCols.Net_Weight_Display) {
    await knex.schema.alterTable('tbl_sales_details', t => {
      t.decimal('Net_Weight_Display', 10, 3).nullable().comment('Gross minus stone weight for display');
    });
  }

  // ── Net_Weight display column on purchase details ──────────────────────────
  const pdExists = await knex.schema.hasTable('tbl_purchase_details');
  if (pdExists) {
    const pdCols = await knex('tbl_purchase_details').columnInfo().catch(() => ({}));
    if (!pdCols.Net_Weight_Display) {
      await knex.schema.alterTable('tbl_purchase_details', t => {
        t.decimal('Net_Weight_Display', 10, 3).nullable();
      });
    }
  }
};

exports.down = async (knex) => {
  // reversible — drop added columns only
  await knex.schema.alterTable('tbl_audit_log', t => {
    t.dropColumn('Username');
    t.dropColumn('Full_Name');
    t.dropColumn('Branch_ID');
    t.dropColumn('Description');
  }).catch(() => {});
};
