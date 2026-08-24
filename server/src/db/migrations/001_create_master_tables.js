/**
 * Migration 001: Global Master Tables
 * All table names lowercase — PostgreSQL knex convention.
 */
exports.up = async function (knex) {

  // ─── 1. tbl_role_master ───────────────────────────────────────────────────
  await knex.schema.createTable('tbl_role_master', (t) => {
    t.increments('Role_ID').primary();
    t.string('Role_Name', 50).notNullable().unique();
    t.text('Role_Description');
    t.jsonb('Permissions');
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  // ─── 2. tbl_tenant_master ─────────────────────────────────────────────────
  await knex.schema.createTable('tbl_tenant_master', (t) => {
    t.string('Tenant_ID', 20).primary();
    t.string('Company_Name', 100).notNullable();
    t.string('Brand_Code', 10).notNullable();
    t.string('Registration_No', 50);
    t.string('GST_No', 20);
    t.string('PAN_No', 20);
    t.string('Address_Line1', 200);
    t.string('Address_Line2', 200);
    t.string('City', 50);
    t.string('State', 50);
    t.string('Pincode', 10);
    t.string('Country', 50).defaultTo('India');
    t.string('Phone', 20);
    t.string('Email', 100);
    t.string('Website', 100);
    t.string('License_Key', 50).unique().notNullable();
    t.boolean('Is_Active').defaultTo(true);
    t.date('License_Expiry_Date').notNullable();
    t.integer('Max_Users').defaultTo(5);
    t.integer('Max_Branches').defaultTo(1);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.string('Created_By', 50);
    t.text('Notes');
  });

  // ─── 3. tbl_branch_master ─────────────────────────────────────────────────
  await knex.schema.createTable('tbl_branch_master', (t) => {
    t.string('Branch_ID', 20).primary();
    t.string('Tenant_ID', 20).references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_Name', 100).notNullable();
    t.string('Branch_Code', 10).notNullable();
    t.string('Address_Line1', 200);
    t.string('Address_Line2', 200);
    t.string('City', 50);
    t.string('State', 50);
    t.string('Pincode', 10);
    t.string('Phone', 20);
    t.string('Email', 100);
    t.string('GST_No', 20);
    t.boolean('Is_Head_Office').defaultTo(false);
    t.boolean('Is_Active').defaultTo(true);
    t.date('Opening_Date');
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
  });

  // ─── 4. tbl_purity_master ─────────────────────────────────────────────────
  await knex.schema.createTable('tbl_purity_master', (t) => {
    t.increments('Purity_ID').primary();
    t.string('Purity_Code', 10).unique().notNullable();
    t.decimal('Karat', 5, 2).notNullable();
    t.decimal('Percentage', 5, 2).notNullable();
    t.string('Description', 50);
    t.string('Hallmark_Standard', 20);
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
  });

  // ─── 5. tbl_item_type_master ──────────────────────────────────────────────
  await knex.schema.createTable('tbl_item_type_master', (t) => {
    t.increments('Type_ID').primary();
    t.string('Type_Code', 20).unique().notNullable();
    t.string('Type_Name', 50).notNullable();
    t.string('Category', 20).notNullable();
    t.boolean('Is_Precious').defaultTo(true);
    t.boolean('Is_Gold').defaultTo(true);
    t.boolean('Is_Silver').defaultTo(false);
    t.decimal('Default_Making_Charge', 10, 2);
    t.decimal('Default_Wastage_Percent', 5, 2);
    t.string('HSN_Code', 20);
    t.decimal('GST_Percentage', 5, 2).defaultTo(3.00);
    t.boolean('Is_Active').defaultTo(true);
    t.string('Image_URL', 500);
    t.text('Description');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
  });

  // ─── 6. tbl_design_master ─────────────────────────────────────────────────
  await knex.schema.createTable('tbl_design_master', (t) => {
    t.increments('Design_ID').primary();
    t.integer('Type_ID').references('Type_ID').inTable('tbl_item_type_master').onDelete('SET NULL');
    t.string('Design_Code', 30).unique().notNullable();
    t.string('Design_Name', 100).notNullable();
    t.string('Collection_Name', 50);
    t.decimal('Estimated_Gold_Weight', 10, 3);
    t.decimal('Estimated_Stone_Weight', 10, 3);
    t.decimal('Estimated_Making_Charge', 10, 2);
    t.decimal('Estimated_Wastage_Percent', 5, 2);
    t.string('Designer_Name', 50);
    t.string('Category', 30);
    t.boolean('Is_Custom_Only').defaultTo(false);
    t.integer('Min_Order_Quantity').defaultTo(1);
    t.string('Image_URL', 500);
    t.string('CAD_File_URL', 500);
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.text('Notes');
  });

  // ─── 7. tbl_gemstone_master ───────────────────────────────────────────────
  await knex.schema.createTable('tbl_gemstone_master', (t) => {
    t.increments('Stone_ID').primary();
    t.string('Stone_Code', 20).unique().notNullable();
    t.string('Stone_Name', 50).notNullable();
    t.string('Stone_Color', 30);
    t.string('Stone_Clarity', 20);
    t.string('Stone_Cut', 20);
    t.decimal('Stone_Carat_Weight', 10, 3);
    t.decimal('Price_Per_Carat', 15, 2);
    t.integer('Supplier_ID');
    t.string('Certificate_No', 50);
    t.boolean('Is_Natural').defaultTo(true);
    t.boolean('Is_Lab_Grown').defaultTo(false);
    t.string('Origin_Country', 50);
    t.string('Image_URL', 500);
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.text('Notes');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_gemstone_master');
  await knex.schema.dropTableIfExists('tbl_design_master');
  await knex.schema.dropTableIfExists('tbl_item_type_master');
  await knex.schema.dropTableIfExists('tbl_purity_master');
  await knex.schema.dropTableIfExists('tbl_branch_master');
  await knex.schema.dropTableIfExists('tbl_tenant_master');
  await knex.schema.dropTableIfExists('tbl_role_master');
};
