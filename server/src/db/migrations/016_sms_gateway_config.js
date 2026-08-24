/**
 * Migration 016:
 * - tbl_sms_gateway_config — per-tenant SMS gateway credentials (Tenant_ID null = global default)
 * - tbl_sms_templates      — DLT-registered message templates per purpose (OTP, REMINDER, ...)
 * - tbl_sms_log            — delivery log for sent SMS (debugging/audit)
 */
exports.up = async function (knex) {

  await knex.schema.createTable('tbl_sms_gateway_config', (t) => {
    t.increments('Config_ID').primary();
    t.string('Tenant_ID', 20).nullable()
      .references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    // Tenant_ID = NULL means this is the global fallback config, used when
    // no tenant-specific row exists.
    t.string('Provider', 30).notNullable().defaultTo('asterix');
    t.string('Api_Base_Url', 255).notNullable();
    t.string('Api_User', 100).notNullable();
    t.string('Api_Key', 150).notNullable();
    t.string('Sender_Id', 20).notNullable();
    t.string('Entity_Id', 50).notNullable();
    t.string('Account_Usage', 10).defaultTo('1');
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Updated_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Provider'], 'uq_sms_gateway_tenant_provider');
  });

  await knex.schema.createTable('tbl_sms_templates', (t) => {
    t.increments('Template_ID').primary();
    t.string('Tenant_ID', 20).nullable()
      .references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    // Tenant_ID = NULL means this is the global fallback template.
    t.string('Purpose', 30).notNullable(); // 'OTP' | 'REMINDER' | 'RECEIPT' | ...
    t.string('Dlt_Template_Id', 50).notNullable();
    t.text('Template_Text').notNullable(); // contains literal placeholder tokens e.g. <OTP>
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Purpose'], 'uq_sms_template_tenant_purpose');
  });

  await knex.schema.createTable('tbl_sms_log', (t) => {
    t.increments('Log_ID').primary();
    t.string('Tenant_ID', 20).nullable();
    t.string('Mobile', 15).notNullable();
    t.string('Purpose', 30).notNullable();
    t.text('Message').notNullable();
    t.string('Status', 20).notNullable(); // 'Sent' | 'Failed'
    t.text('Provider_Response');
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Created_Date'], 'idx_sms_log_tenant_date');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_sms_log');
  await knex.schema.dropTableIfExists('tbl_sms_templates');
  await knex.schema.dropTableIfExists('tbl_sms_gateway_config');
};
