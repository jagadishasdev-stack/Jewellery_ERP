/**
 * Fine-grained per-user permission overrides.
 *
 * Legacy `sec_permissions`/`sec_userpermission`/`sec_userroles` — role-level
 * permissions already exist (tbl_role_master.Permissions jsonb +
 * tbl_user_master.Role_ID), and tbl_erp_modules is already this schema's
 * module registry (legacy `sec_modulelist`'s equivalent — not re-created
 * here). What's missing is a per-*user* exception on top of their role
 * ("this one cashier also gets Approve on repairs despite their role not
 * normally having it") and per-bin/location stock-access restriction
 * (legacy `sec_userbin` — which bins/trays of loose stock a given staff
 * member is allowed to open), neither of which the single jsonb column on
 * the role can express per-individual.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_user_permission_override', (t) => {
    t.bigIncrements('Override_ID').primary();
    t.integer('User_ID').notNullable().references('User_ID').inTable('tbl_user_master').onDelete('CASCADE');
    t.string('Module_Key', 50).notNullable().references('Module_Key').inTable('tbl_erp_modules').onDelete('CASCADE');
    t.boolean('Can_View').defaultTo(true);
    t.boolean('Can_Add').defaultTo(false);
    t.boolean('Can_Edit').defaultTo(false);
    t.boolean('Can_Delete').defaultTo(false);
    t.boolean('Can_Approve').defaultTo(false);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['User_ID', 'Module_Key']);
  });

  await knex.schema.createTable('tbl_user_bin_access', (t) => {
    t.bigIncrements('Access_ID').primary();
    t.integer('User_ID').notNullable().references('User_ID').inTable('tbl_user_master').onDelete('CASCADE');
    t.integer('Tray_ID').references('Tray_ID').inTable('tbl_tray_master').onDelete('CASCADE');
    t.integer('Hidden_Location_ID').references('Hidden_Location_ID').inTable('tbl_hidden_location_master').onDelete('CASCADE');
    t.string('Access_Level', 20).defaultTo('View'); // View | Full
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['User_ID'], 'idx_user_bin_access_user');
  });

  const existingModule = await knex('tbl_erp_modules').where('Module_Key', 'user_permission_overrides').first();
  if (!existingModule) {
    await knex('tbl_erp_modules').insert({
      Module_Key: 'user_permission_overrides',
      Module_Name: 'User Permission Overrides',
      Module_Group: 'Settings',
      Sort_Order: 40,
      Is_Core: false,
      Default_Retailer: true,
      Default_Wholesaler: true,
      Default_Manufacturer: true,
      Default_Hybrid: true,
    });
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').where('Module_Key', 'user_permission_overrides').del();
  await knex.schema.dropTableIfExists('tbl_user_bin_access');
  await knex.schema.dropTableIfExists('tbl_user_permission_override');
};
