/**
 * CRM Module — leads, follow-ups, feedback.
 *
 * Ported from legacy `crm_lead_entry`/`crm_master` (walk-in/enquiry capture
 * before someone becomes a paying tbl_customer_master row) and
 * `custfollowups`/`cust_feedback`. tbl_crm_followup deliberately has both
 * Lead_ID and Customer_ID nullable FKs (not a single polymorphic column) —
 * a follow-up is either against a not-yet-converted lead or an existing
 * customer, and keeping two real FKs lets Postgres enforce referential
 * integrity on whichever one is used, unlike a generic Reference_Table
 * string.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_crm_lead', (t) => {
    t.bigIncrements('Lead_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Lead_Name', 100).notNullable();
    t.string('Mobile', 15).notNullable();
    t.string('Email', 100);
    t.string('Source', 30).defaultTo('Walk-in'); // Walk-in | Referral | Online | Social Media | Ad
    t.string('Interested_In', 200);
    t.integer('Assigned_To').references('User_ID').inTable('tbl_user_master').onDelete('SET NULL');
    t.string('Status', 20).notNullable().defaultTo('New'); // New | Contacted | Converted | Lost
    t.integer('Converted_Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('SET NULL');
    t.date('Converted_Date');
    t.string('Lost_Reason', 200);
    t.text('Remarks');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Status'], 'idx_crm_lead_status');
    t.index(['Mobile'], 'idx_crm_lead_mobile');
  });

  await knex.schema.createTable('tbl_crm_followup', (t) => {
    t.bigIncrements('Followup_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.bigInteger('Lead_ID').references('Lead_ID').inTable('tbl_crm_lead').onDelete('CASCADE');
    t.integer('Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('CASCADE');
    t.timestamp('Followup_Date').defaultTo(knex.fn.now());
    t.date('Next_Followup_Date');
    t.string('Contact_Mode', 20); // Call | SMS | WhatsApp | Visit | Email
    t.text('Remarks').notNullable();
    t.integer('Done_By').references('User_ID').inTable('tbl_user_master').onDelete('SET NULL');
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Lead_ID'], 'idx_crm_followup_lead');
    t.index(['Customer_ID'], 'idx_crm_followup_customer');
    t.index(['Next_Followup_Date'], 'idx_crm_followup_next');
  });

  await knex.schema.createTable('tbl_customer_feedback', (t) => {
    t.bigIncrements('Feedback_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('SET NULL');
    t.bigInteger('Sale_ID').references('Sale_ID').inTable('tbl_sales_header').onDelete('SET NULL');
    t.integer('Rating').notNullable(); // 1-5
    t.text('Comments');
    t.string('Feedback_Type', 30).defaultTo('General'); // General | Complaint | Suggestion
    t.string('Status', 20).defaultTo('Open'); // Open | Resolved
    t.text('Resolution_Notes');
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Customer_ID'], 'idx_customer_feedback_customer');
  });

  const existingModule = await knex('tbl_erp_modules').where('Module_Key', 'crm').first();
  if (!existingModule) {
    await knex('tbl_erp_modules').insert({
      Module_Key: 'crm',
      Module_Name: 'CRM — Leads & Feedback',
      Module_Group: 'Customer',
      Sort_Order: 32,
      Is_Core: false,
      Default_Retailer: true,
      Default_Wholesaler: false,
      Default_Manufacturer: false,
      Default_Hybrid: true,
    });
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').where('Module_Key', 'crm').del();
  await knex.schema.dropTableIfExists('tbl_customer_feedback');
  await knex.schema.dropTableIfExists('tbl_crm_followup');
  await knex.schema.dropTableIfExists('tbl_crm_lead');
};
