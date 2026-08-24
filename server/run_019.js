const knex = require('./src/db/knex');
async function run() {
  // Agent Master table
  if (!(await knex.schema.hasTable('tbl_agent_master'))) {
    await knex.schema.createTable('tbl_agent_master', t => {
      t.increments('Agent_ID').primary();
      t.string('Tenant_ID', 50).notNullable();
      t.string('Branch_ID', 50).nullable();
      t.string('Agent_Code', 30).unique().notNullable();
      t.string('Agent_Name', 100).notNullable();
      t.string('Mobile', 20).notNullable();
      t.string('Email', 100).nullable();
      t.string('Address', 300).nullable();
      t.string('Status', 10).defaultTo('Active'); // Active | Inactive
      t.decimal('Commission_Pct', 5, 2).defaultTo(0);
      t.string('Created_By', 100);
      t.timestamp('Created_Date').defaultTo(knex.fn.now());
      t.timestamp('Modified_Date').nullable();
      t.unique(['Tenant_ID', 'Mobile']);
    });
    console.log('Created tbl_agent_master');
  }

  // OTP store table (for savings app mobile OTP flow)
  if (!(await knex.schema.hasTable('tbl_mobile_otp'))) {
    await knex.schema.createTable('tbl_mobile_otp', t => {
      t.increments('OTP_ID').primary();
      t.string('Mobile', 20).notNullable();
      t.string('OTP', 6).notNullable();
      t.string('Purpose', 30).defaultTo('LOGIN'); // LOGIN | REGISTER | RESET
      t.boolean('Is_Used').defaultTo(false);
      t.timestamp('Expires_At').notNullable();
      t.timestamp('Created_Date').defaultTo(knex.fn.now());
    });
    await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_otp_mobile ON tbl_mobile_otp("Mobile")');
    console.log('Created tbl_mobile_otp');
  }

  // Tenant config table — stores theme, app IDs, etc.
  if (!(await knex.schema.hasTable('tbl_tenant_app_config'))) {
    await knex.schema.createTable('tbl_tenant_app_config', t => {
      t.increments('Config_ID').primary();
      t.string('Tenant_ID', 50).unique().notNullable();
      t.integer('Theme_ID').defaultTo(1);
      t.string('App_Package', 100).nullable();   // com.company.savings
      t.string('Apple_App_ID', 30).nullable();   // App Store ID
      t.string('Play_Store_URL', 300).nullable();
      t.string('App_Store_URL', 300).nullable();
      t.string('Primary_Color', 20).defaultTo('#B8860B');
      t.string('Secondary_Color', 20).defaultTo('#FFD700');
      t.string('Logo_URL', 500).nullable();
      t.text('Terms_And_Conditions').nullable();
      t.text('Privacy_Policy').nullable();
      t.string('Support_Mobile', 20).nullable();
      t.string('Support_Email', 100).nullable();
      t.boolean('Enable_Digi_Gold').defaultTo(true);
      t.boolean('Enable_OTP_LOGIN').defaultTo(true);
      t.string('Created_By', 100);
      t.timestamp('Created_Date').defaultTo(knex.fn.now());
    });
    console.log('Created tbl_tenant_app_config');
  }

  // Seed default app config for existing tenants
  const tenants = await knex('tbl_tenant_master').where('Is_Active', true).select('Tenant_ID', 'Company_Name');
  for (const t of tenants) {
    const exists = await knex('tbl_tenant_app_config').where('Tenant_ID', t.Tenant_ID).first();
    if (!exists) {
      await knex('tbl_tenant_app_config').insert({
        Tenant_ID:   t.Tenant_ID,
        Theme_ID:    1,
        Created_By:  'system',
      });
    }
  }
  console.log('Seeded tbl_tenant_app_config for', tenants.length, 'tenants');
  console.log('Migration 019 done');
  process.exit(0);
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
