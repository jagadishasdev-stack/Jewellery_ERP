/**
 * Insurance & AMC (Annual Maintenance Contract) Module.
 *
 * Ported from legacy `insurance`/`insurance_policy` (customer-facing jewellery
 * insurance, sold at billing time) and `amc_cust`/`amc_det` (a paid annual
 * cleaning/re-polishing/re-plating contract). Both are optional add-ons a
 * customer buys against a specific piece (or an entire sale), so both link
 * to Sale_ID/Ornament_ID as nullable — an AMC or policy can be sold
 * independently of a sale that happened in this system (e.g. on an item the
 * customer already owned).
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_insurance_policy_master', (t) => {
    t.increments('Policy_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Insurer_Name', 100).notNullable();
    t.string('Policy_Number', 50).notNullable();
    t.string('Coverage_Type', 30); // Theft | Loss | Damage | All Risk
    t.decimal('Premium_Rate_Pct', 5, 2); // premium as % of insured value, if flat-rated
    t.jsonb('Premium_Slab_Rules'); // optional slab table: [{from, to, premium}]
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tbl_customer_insurance', (t) => {
    t.bigIncrements('Insurance_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('SET NULL');
    t.bigInteger('Sale_ID').references('Sale_ID').inTable('tbl_sales_header').onDelete('SET NULL');
    t.bigInteger('Ornament_ID').references('Ornament_ID').inTable('tbl_ornament_master').onDelete('SET NULL');
    t.integer('Policy_ID').references('Policy_ID').inTable('tbl_insurance_policy_master').onDelete('SET NULL');
    t.string('Certificate_Number', 50);
    t.decimal('Sum_Insured', 15, 2).notNullable();
    t.decimal('Premium_Amount', 15, 2).notNullable();
    t.date('Start_Date').notNullable();
    t.date('Expiry_Date').notNullable();
    t.string('Status', 20).defaultTo('Active'); // Active | Expired | Claimed | Cancelled
    t.date('Claim_Date');
    t.decimal('Claim_Amount', 15, 2);
    t.text('Remarks');
    t.smallint('Data_Mode').notNullable().defaultTo(3);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Status'], 'idx_customer_insurance_status');
    t.index(['Customer_ID'], 'idx_customer_insurance_customer');
  });

  await knex.schema.createTable('tbl_amc_plan_master', (t) => {
    t.increments('Plan_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Plan_Name', 100).notNullable();
    t.integer('Duration_Months').notNullable().defaultTo(12);
    t.decimal('Amount', 10, 2).notNullable();
    t.integer('Free_Services_Included').defaultTo(1);
    t.text('Coverage_Details'); // e.g. "1 free cleaning + rhodium polish per year"
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tbl_amc_enrollment', (t) => {
    t.bigIncrements('Enrollment_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('SET NULL');
    t.integer('Plan_ID').references('Plan_ID').inTable('tbl_amc_plan_master').onDelete('SET NULL');
    t.bigInteger('Ornament_ID').references('Ornament_ID').inTable('tbl_ornament_master').onDelete('SET NULL');
    t.bigInteger('Sale_ID').references('Sale_ID').inTable('tbl_sales_header').onDelete('SET NULL');
    t.date('Start_Date').notNullable();
    t.date('Expiry_Date').notNullable();
    t.decimal('Amount_Paid', 10, 2).notNullable();
    t.date('Last_Service_Date');
    t.integer('Services_Used').defaultTo(0);
    t.string('Status', 20).defaultTo('Active'); // Active | Expired | Cancelled
    t.text('Remarks');
    t.smallint('Data_Mode').notNullable().defaultTo(3);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Status'], 'idx_amc_enrollment_status');
  });

  const existingModule = await knex('tbl_erp_modules').where('Module_Key', 'insurance_amc').first();
  if (!existingModule) {
    await knex('tbl_erp_modules').insert({
      Module_Key: 'insurance_amc',
      Module_Name: 'Insurance & AMC',
      Module_Group: 'Customer',
      Sort_Order: 30,
      Is_Core: false,
      Default_Retailer: true,
      Default_Wholesaler: false,
      Default_Manufacturer: false,
      Default_Hybrid: true,
    });
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').where('Module_Key', 'insurance_amc').del();
  await knex.schema.dropTableIfExists('tbl_amc_enrollment');
  await knex.schema.dropTableIfExists('tbl_amc_plan_master');
  await knex.schema.dropTableIfExists('tbl_customer_insurance');
  await knex.schema.dropTableIfExists('tbl_insurance_policy_master');
};
