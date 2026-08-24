/**
 * Migration 012 — Display Settings & Custom Permissions tables
 * tbl_display_settings: per-role and per-user screen permission matrix
 * Add Custom_Permissions column to tbl_user_master
 */
exports.up = async (knex) => {
  // ── tbl_display_settings ──────────────────────────────────────────────────
  const exists = await knex.schema.hasTable('tbl_display_settings');
  if (!exists) {
    await knex.schema.createTable('tbl_display_settings', t => {
      t.increments('Setting_ID').primary();
      t.string('Tenant_ID', 50).notNullable();
      t.string('Setting_Type', 20).notNullable();   // 'role' | 'user'
      t.string('Reference_ID', 50).notNullable();    // Role_ID or User_ID
      t.jsonb('Matrix_JSON').notNullable();           // { 'Module:Screen': { View, Add, Edit, Delete, Approve, Print, Export } }
      t.string('Created_By', 100);
      t.string('Updated_By', 100);
      t.timestamp('Created_Date').defaultTo(knex.fn.now());
      t.timestamp('Updated_Date').defaultTo(knex.fn.now());
      t.unique(['Tenant_ID', 'Setting_Type', 'Reference_ID']);
    });
  }

  // ── Add Custom_Permissions to tbl_user_master if missing ──────────────────
  const userCols = await knex('tbl_user_master').columnInfo().catch(() => ({}));
  if (userCols.User_ID && !userCols.Custom_Permissions) {
    await knex.schema.alterTable('tbl_user_master', t => {
      t.jsonb('Custom_Permissions').nullable().comment('User-specific permission overrides — takes precedence over role');
      t.string('Employee_Code', 30).nullable();
      t.string('Department', 100).nullable();
      t.string('Branch_ID', 50).nullable();
    });
  }

  // ── Add Description to tbl_role_master if missing ─────────────────────────
  const roleCols = await knex('tbl_role_master').columnInfo().catch(() => ({}));
  if (roleCols.Role_ID && !roleCols.Description) {
    await knex.schema.alterTable('tbl_role_master', t => {
      t.text('Description').nullable();
      t.string('Created_By', 100).nullable();
      t.timestamp('Modified_Date').nullable();
    });
  }
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('tbl_display_settings');
};
