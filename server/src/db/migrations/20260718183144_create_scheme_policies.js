/**
 * tbl_scheme_policies — Terms & Conditions / About Us / Privacy / Return /
 * Shipping policy sections. Tenant_ID = NULL rows are the global fallback,
 * same convention as tbl_sms_gateway_config / tbl_sms_templates.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_scheme_policies', (t) => {
    t.increments('Policy_ID').primary();
    t.string('Tenant_ID', 20).nullable()
      .references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Policy_Type', 20).notNullable(); // 'TERMS' | 'ABOUT' | 'PRIVACY' | 'RETURN' | 'SHIPPING'
    t.string('Section_Title', 200).notNullable();
    t.text('Section_Content').notNullable();
    t.integer('Sort_Order').defaultTo(0);
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Updated_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Policy_Type', 'Sort_Order'], 'idx_scheme_policies_lookup');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_scheme_policies');
};
