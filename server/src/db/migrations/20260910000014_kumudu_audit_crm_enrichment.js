/**
 * Kumudu Schema Audit — CRM gaps. The dump modeled 6 near-identical
 * tenant-configurable dropdown lists as 6 separate tables
 * (crm_leadtype, crm_enqsrc, crm_infosource, crm_newspaper, crm_place,
 * crm_prof) — one generic, List_Type-discriminated table is the better
 * normalized design for the same thing, and matches the pattern already
 * used for this project's other small reference masters. Same idea for
 * itemized feedback: rather than the dump's 18 fixed rating1..rating18
 * columns, a proper criteria master + a linked ratings table lets a
 * tenant define however many criteria they actually want.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('tbl_crm_list_master', (t) => {
    t.increments('List_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('List_Type', 30).notNullable(); // LeadSource | EnquirySource | InfoSource | Newspaper | Place | Profession
    t.string('Value', 150).notNullable();
    t.integer('Sort_Order').defaultTo(0);
    t.boolean('Is_Active').defaultTo(true);
    t.unique(['Tenant_ID', 'List_Type', 'Value']);
  });

  await knex.schema.createTable('tbl_crm_rating_criteria', (t) => {
    t.increments('Criteria_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Criteria_Name', 150).notNullable(); // e.g. "Showroom Atmosphere", "Staff Behaviour", "Making Charges"
    t.integer('Sort_Order').defaultTo(0);
    t.boolean('Is_Active').defaultTo(true);
    t.unique(['Tenant_ID', 'Criteria_Name']);
  });

  await knex.schema.createTable('tbl_crm_feedback_ratings', (t) => {
    t.increments('Rating_ID').primary();
    t.integer('Feedback_ID').notNullable().references('Feedback_ID').inTable('tbl_customer_feedback').onDelete('CASCADE');
    t.integer('Criteria_ID').notNullable().references('Criteria_ID').inTable('tbl_crm_rating_criteria').onDelete('CASCADE');
    t.integer('Score').notNullable();
    t.unique(['Feedback_ID', 'Criteria_ID']);
  });
  await knex.raw(`ALTER TABLE "tbl_crm_feedback_ratings" ADD CONSTRAINT "chk_crm_feedback_ratings_score" CHECK ("Score" BETWEEN 1 AND 5)`);

  await knex.schema.alterTable('tbl_customer_master', (t) => {
    t.decimal('Annual_Income', 14, 2);
    t.string('Profession', 100);
    t.boolean('Is_Blocklisted').defaultTo(false);
    t.text('Blocklist_Reason');
  });

  await knex.schema.createTable('tbl_faq', (t) => {
    t.increments('FAQ_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.text('Question').notNullable();
    t.text('Answer').notNullable();
    t.integer('Sort_Order').defaultTo(0);
    t.boolean('Is_Active').defaultTo(true);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tbl_faq');
  await knex.schema.alterTable('tbl_customer_master', (t) => {
    t.dropColumn('Annual_Income');
    t.dropColumn('Profession');
    t.dropColumn('Is_Blocklisted');
    t.dropColumn('Blocklist_Reason');
  });
  await knex.schema.dropTableIfExists('tbl_crm_feedback_ratings');
  await knex.schema.dropTableIfExists('tbl_crm_rating_criteria');
  await knex.schema.dropTableIfExists('tbl_crm_list_master');
};
