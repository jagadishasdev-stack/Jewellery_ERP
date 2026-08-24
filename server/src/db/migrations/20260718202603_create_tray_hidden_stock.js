/**
 * Tray/Showcase hierarchy (3rd level under Floor -> Counter), owner-configurable
 * Hidden Locations, and the Hidden Stock mechanism on tbl_ornament_master.
 * Hiding/unhiding is modeled as a stock transfer (Transfer_Type 'Hide'/'Unhide')
 * so it reuses the existing voucher + audit trail, per the approved plan.
 */
exports.up = async function (knex) {
  // ─── tbl_tray_master ────────────────────────────────────────────────────
  await knex.schema.createTable('tbl_tray_master', (t) => {
    t.increments('Tray_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).notNullable().references('Branch_ID').inTable('tbl_branch_master').onDelete('CASCADE');
    t.integer('Floor_ID').notNullable().references('Floor_ID').inTable('tbl_floor_master').onDelete('CASCADE');
    t.integer('Counter_ID').notNullable().references('Counter_ID').inTable('tbl_counter_master').onDelete('CASCADE');
    t.string('Tray_Code', 20).notNullable();
    t.string('Tray_Name', 100).notNullable();
    t.integer('Capacity').defaultTo(20);
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Branch_ID', 'Counter_ID', 'Tray_Code']);
  });

  // ─── tbl_hidden_location_master ─────────────────────────────────────────
  await knex.schema.createTable('tbl_hidden_location_master', (t) => {
    t.increments('Hidden_Location_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Location_Code', 20).notNullable();
    t.string('Location_Name', 100).notNullable(); // 'Hidden Stock', 'Owner Reserve', 'Vault Stock' ...
    t.string('Description', 200);
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Location_Code']);
  });

  // ─── tbl_ornament_master: real structured location + hidden-stock fields ─
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    t.integer('Floor_ID').references('Floor_ID').inTable('tbl_floor_master').onDelete('SET NULL');
    t.integer('Counter_ID').references('Counter_ID').inTable('tbl_counter_master').onDelete('SET NULL');
    t.integer('Tray_ID').references('Tray_ID').inTable('tbl_tray_master').onDelete('SET NULL');

    t.boolean('Is_Hidden').notNullable().defaultTo(false);
    t.integer('Hidden_Location_ID').references('Hidden_Location_ID').inTable('tbl_hidden_location_master').onDelete('SET NULL');
    t.string('Hidden_By', 50);
    t.timestamp('Hidden_Date');
    t.text('Hidden_Reason');
    t.string('Restored_By', 50);
    t.timestamp('Restored_Date');

    t.index(['Tenant_ID', 'Is_Hidden'], 'idx_ornament_is_hidden');
  });

  // ─── tbl_stock_transfer: Tray support + Hide/Unhide destination ─────────
  await knex.schema.alterTable('tbl_stock_transfer', (t) => {
    t.integer('From_Tray_ID').references('Tray_ID').inTable('tbl_tray_master').onDelete('SET NULL');
    t.integer('To_Tray_ID').references('Tray_ID').inTable('tbl_tray_master').onDelete('SET NULL');
    t.integer('To_Hidden_Location_ID').references('Hidden_Location_ID').inTable('tbl_hidden_location_master').onDelete('SET NULL');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_stock_transfer', (t) => {
    t.dropColumn('From_Tray_ID');
    t.dropColumn('To_Tray_ID');
    t.dropColumn('To_Hidden_Location_ID');
  });
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    t.dropColumn('Floor_ID');
    t.dropColumn('Counter_ID');
    t.dropColumn('Tray_ID');
    t.dropColumn('Is_Hidden');
    t.dropColumn('Hidden_Location_ID');
    t.dropColumn('Hidden_By');
    t.dropColumn('Hidden_Date');
    t.dropColumn('Hidden_Reason');
    t.dropColumn('Restored_By');
    t.dropColumn('Restored_Date');
  });
  await knex.schema.dropTableIfExists('tbl_hidden_location_master');
  await knex.schema.dropTableIfExists('tbl_tray_master');
};
