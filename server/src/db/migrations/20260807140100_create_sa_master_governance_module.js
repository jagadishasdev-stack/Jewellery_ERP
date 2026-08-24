/**
 * SA_MASTER control-plane governance: device registration, app version
 * gating, and SaaS subscription/billing — the remaining pieces of §7's
 * SA_MASTER table list that don't already exist.
 *
 * Already covered elsewhere, NOT recreated here:
 *   - tenants, tenant_databases  → tbl_tenant_master (incl. its DB_Host/
 *     DB_Port/DB_Name/DB_User/DB_Password/DB_SSL columns)
 *   - branches                   → tbl_branch_master
 *   - licenses                   → tbl_license_master
 *   - audit_logs                 → tbl_audit_log
 *   - users (incl. the platform operator, Tenant_ID = 'SA_MASTER')
 *                                 → tbl_user_master
 *
 * These are control-plane-only: they describe the SaaS platform itself
 * (which devices exist, which app version is current, who's paying for
 * what), not any one shop's operational data — so, like tbl_tenant_master
 * itself, they're excluded from the single-tenant local MySQL schema.
 *
 * tbl_device_master.Device_ID is a meaningful string PK (e.g.
 * "THJ-SKH-PC-001"), matching the existing Tenant_ID/Branch_ID convention
 * of using a human-readable natural key as the PK on control-plane identity
 * tables, rather than a surrogate integer nobody would ever type or debug
 * against.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_device_master', (t) => {
    t.string('Device_ID', 50).primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Device_Name', 100);
    t.string('Device_Type', 20).notNullable(); // PC | Mac | Web | Mobile
    t.string('Operating_System', 50);
    t.string('App_Version', 20);
    t.string('DB_Schema_Version', 20);
    t.timestamp('Last_Sync_Date');
    t.string('Last_IP_Address', 50);
    t.string('Status', 20).notNullable().defaultTo('Active'); // Active | Inactive | Revoked
    t.timestamp('Registered_Date').defaultTo(knex.fn.now());
    t.timestamp('Revoked_Date');
    t.text('Revoked_Reason');
    t.index(['Tenant_ID', 'Status'], 'idx_device_tenant_status');
  });

  await knex.schema.createTable('tbl_app_version_master', (t) => {
    t.increments('Version_ID').primary();
    t.string('Platform', 20).notNullable(); // Windows | macOS | Web | Android | iOS
    t.string('Version_Number', 20).notNullable();
    t.boolean('Is_Mandatory').defaultTo(false);
    t.string('Min_Supported_Version', 20);
    t.text('Release_Notes');
    t.string('Download_URL', 500);
    t.date('Released_Date').notNullable();
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Platform', 'Version_Number']);
  });

  await knex.schema.createTable('tbl_subscription_plan_master', (t) => {
    t.increments('Plan_ID').primary();
    t.string('Plan_Name', 50).notNullable();
    t.decimal('Monthly_Price', 10, 2).defaultTo(0);
    t.decimal('Annual_Price', 10, 2).defaultTo(0);
    t.integer('Max_Users').defaultTo(5);
    t.integer('Max_Branches').defaultTo(1);
    t.integer('Max_Devices').defaultTo(5);
    t.jsonb('Features_JSON');
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tbl_tenant_subscription', (t) => {
    t.increments('Subscription_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Plan_ID').references('Plan_ID').inTable('tbl_subscription_plan_master').onDelete('SET NULL');
    t.date('Start_Date').notNullable();
    t.date('End_Date');
    t.string('Billing_Cycle', 10).defaultTo('Monthly'); // Monthly | Annual
    t.string('Status', 20).notNullable().defaultTo('Active'); // Active | Expired | Cancelled | Grace_Period
    t.integer('Grace_Period_Days').defaultTo(7);
    t.date('Last_Payment_Date');
    t.decimal('Last_Payment_Amount', 10, 2);
    t.string('Payment_Reference', 100);
    t.boolean('Auto_Renew').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Status'], 'idx_tenant_subscription_status');
  });

  await knex.schema.createTable('tbl_system_setting', (t) => {
    t.string('Setting_Key', 100).primary();
    t.text('Setting_Value');
    t.string('Description', 300);
    t.string('Updated_By', 50);
    t.timestamp('Updated_Date').defaultTo(knex.fn.now());
  });

  // No tbl_erp_modules row here, deliberately — that registry gates which
  // *tenant-facing* modules show up in a shop's own menu by business type
  // (Default_Retailer/Wholesaler/...). Device registration, app-version
  // gating, and subscription billing aren't a shop's module to enable or
  // disable — they're the platform operator's own always-on capability,
  // so they don't belong in that table at all.
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_system_setting');
  await knex.schema.dropTableIfExists('tbl_tenant_subscription');
  await knex.schema.dropTableIfExists('tbl_subscription_plan_master');
  await knex.schema.dropTableIfExists('tbl_app_version_master');
  await knex.schema.dropTableIfExists('tbl_device_master');
};
