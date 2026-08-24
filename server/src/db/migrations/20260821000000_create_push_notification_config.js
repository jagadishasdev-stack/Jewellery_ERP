/**
 * Migration 20260821000000:
 * - tbl_push_notification_config — per-tenant Firebase Admin SDK service
 *   account (Tenant_ID null = global default), mirroring the same
 *   tenant-then-global-fallback pattern as tbl_sms_gateway_config.
 * - tbl_push_log — delivery log for sent push notifications (debugging/audit)
 */
exports.up = async function (knex) {

  await knex.schema.createTable('tbl_push_notification_config', (t) => {
    t.increments('Config_ID').primary();
    t.string('Tenant_ID', 20).nullable()
      .references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    // Tenant_ID = NULL means this is the global fallback config, used when
    // no tenant-specific row exists.
    t.string('Provider', 30).notNullable().defaultTo('firebase');
    // Denormalized out of the service account JSON purely for display in
    // the admin UI without having to parse the JSON blob every time.
    t.string('Project_ID', 100).notNullable();
    // The full downloaded Firebase service-account JSON, stored as-is.
    // admin.credential.cert() takes this object directly — never split into
    // separate columns, since Firebase's own key rotation/format is the
    // source of truth for its shape, not this schema.
    t.text('Service_Account_JSON').notNullable();
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Updated_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Provider'], 'uq_push_config_tenant_provider');
  });

  await knex.schema.createTable('tbl_push_log', (t) => {
    t.increments('Log_ID').primary();
    t.string('Tenant_ID', 20).nullable();
    t.string('Device_Token', 500).notNullable();
    t.string('Purpose', 30).notNullable(); // 'TEST' | 'COLLECTION_REMINDER' | ...
    t.string('Title', 200);
    t.text('Body');
    t.string('Status', 20).notNullable(); // 'Sent' | 'Failed'
    t.text('Provider_Response');
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Created_Date'], 'idx_push_log_tenant_date');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_push_log');
  await knex.schema.dropTableIfExists('tbl_push_notification_config');
};
