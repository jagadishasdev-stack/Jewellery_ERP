/**
 * Migration 002: Tenant-specific tables
 * Order matters for FK references:
 *   License → User → Vendor → Customer → Ornament
 */
exports.up = async function (knex) {

  // ─── 1. tbl_License_Master ─────────────────────────────────────────────────
  await knex.schema.createTable('tbl_license_master', (t) => {
    t.increments('License_ID').primary();
    t.string('License_Key', 50).unique().notNullable();
    t.string('Tenant_ID', 20).references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('License_Type', 20);
    t.date('Issued_Date').notNullable();
    t.date('Expiry_Date').notNullable();
    t.integer('Max_Users').defaultTo(5);
    t.integer('Max_Branches').defaultTo(1);
    t.boolean('Is_Active').defaultTo(true);
    t.boolean('Is_Revoked').defaultTo(false);
    t.text('Revocation_Reason');
    t.string('Hardware_ID', 200);
    t.timestamp('Last_Verified');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
  });

  // ─── 2. tbl_User_Master ────────────────────────────────────────────────────
  await knex.schema.createTable('tbl_user_master', (t) => {
    t.increments('User_ID').primary();
    t.string('Tenant_ID', 20).references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Username', 50).notNullable();
    t.string('Password_Hash', 255).notNullable();
    t.string('Password_Salt', 50).notNullable();
    t.integer('Role_ID').references('Role_ID').inTable('tbl_role_master').onDelete('SET NULL');
    t.string('Employee_ID', 30);
    t.string('Full_Name', 100).notNullable();
    t.string('Email', 100);
    t.string('Mobile', 15);
    t.boolean('Is_Active').defaultTo(true);
    t.boolean('Is_Admin').defaultTo(false);
    t.string('Last_Login_IP', 50);
    t.timestamp('Last_Login_Date');
    t.integer('Login_Attempts').defaultTo(0);
    t.timestamp('Locked_Until');
    t.boolean('Can_Open_Customer_Display').defaultTo(true);
    t.boolean('Can_Edit_Invoice_Template').defaultTo(false);
    t.boolean('Can_Manage_Karigar').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Username']);
  });

  // ─── 3. tbl_Vendor_Master ──────────────────────────────────────────────────
  await knex.schema.createTable('tbl_vendor_master', (t) => {
    t.increments('Vendor_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Vendor_Type', 20).notNullable();
    t.string('Vendor_Code', 30).unique().notNullable();
    t.string('Vendor_Name', 100).notNullable();
    t.string('Contact_Person', 50);
    t.string('Mobile_1', 15).notNullable();
    t.string('Mobile_2', 15);
    t.string('Email', 100);
    t.string('Address_Line1', 200);
    t.string('Address_Line2', 200);
    t.string('City', 50);
    t.string('State', 50);
    t.string('Pincode', 10);
    t.string('GST_No', 20);
    t.string('PAN_No', 20);
    t.string('Bank_Name', 50);
    t.string('Bank_Account_No', 30);
    t.string('IFSC_Code', 20);
    t.decimal('Opening_Balance', 15, 2).defaultTo(0);
    t.decimal('Current_Balance', 15, 2).defaultTo(0);
    t.decimal('Credit_Limit', 15, 2);
    t.integer('Credit_Days').defaultTo(30);
    t.string('Karigar_Skill', 30);
    t.integer('Karigar_Experience_Years');
    t.integer('Karigar_Daily_Capacity');
    t.decimal('Karigar_Wastage_Allowed_Percent', 5, 2);
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.text('Notes');
  });

  // ─── 4. tbl_Customer_Master ────────────────────────────────────────────────
  await knex.schema.createTable('tbl_customer_master', (t) => {
    t.increments('Customer_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Customer_Code', 30).unique().notNullable();
    t.string('Customer_Name', 100).notNullable();
    t.string('Mobile_1', 15).notNullable();
    t.string('Mobile_2', 15);
    t.string('Email', 100);
    t.date('Date_Of_Birth');
    t.date('Anniversary_Date');
    t.string('Occupation', 50);
    t.string('Income_Group', 20);
    t.string('Address_Line1', 200);
    t.string('Address_Line2', 200);
    t.string('City', 50);
    t.string('State', 50);
    t.string('Pincode', 10);
    t.string('GST_No', 20);
    t.string('PAN_No', 20);
    t.decimal('Loyalty_Points', 10, 2).defaultTo(0);
    t.decimal('Total_Purchase_Value', 15, 2).defaultTo(0);
    t.integer('Total_Purchase_Count').defaultTo(0);
    t.date('Last_Purchase_Date');
    t.string('Preferred_Type', 30);
    t.string('Preferred_Purity', 10);
    t.string('Family_Member_1_Name', 100);
    t.string('Family_Member_1_Relation', 20);
    t.string('Family_Member_2_Name', 100);
    t.string('Family_Member_2_Relation', 20);
    t.string('Referred_By', 100);
    t.boolean('Is_Wholesale').defaultTo(false);
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.text('Notes');
    t.index(['Mobile_1'], 'idx_customer_mobile');
    t.index(['Tenant_ID'], 'idx_customer_tenant');
    t.unique(['Tenant_ID', 'Mobile_1']);
  });

  // ─── 5. tbl_Ornament_Master ────────────────────────────────────────────────
  // Vendor must exist before this table (FK on Supplier_ID, Karigar_ID)
  await knex.schema.createTable('tbl_ornament_master', (t) => {
    t.bigIncrements('Ornament_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Article_Number', 50).unique().notNullable();
    t.integer('Type_ID').references('Type_ID').inTable('tbl_item_type_master').onDelete('SET NULL');
    t.integer('Design_ID').references('Design_ID').inTable('tbl_design_master').onDelete('SET NULL');
    t.integer('Purity_ID').references('Purity_ID').inTable('tbl_purity_master').onDelete('SET NULL');
    t.decimal('Gross_Weight', 10, 3).notNullable();
    t.decimal('Net_Gold_Weight', 10, 3).notNullable();
    t.decimal('Stone_Weight', 10, 3).defaultTo(0.000);
    t.decimal('Wastage_Weight', 10, 3).defaultTo(0.000);
    t.decimal('Melting_Weight', 10, 3).defaultTo(0.000);
    t.integer('Stone_ID').references('Stone_ID').inTable('tbl_gemstone_master').onDelete('SET NULL');
    t.integer('Number_Of_Stones').defaultTo(0);
    t.decimal('Total_Stone_Carat', 10, 3).defaultTo(0.000);
    t.decimal('Current_Gold_Rate', 10, 2).notNullable();
    t.decimal('Base_Making_Charge_Per_Gram', 10, 2).notNullable();
    t.decimal('Final_Making_Charge_Total', 10, 2);
    t.decimal('Wastage_Percentage', 5, 2).defaultTo(3.00);
    t.decimal('Wastage_Amount', 10, 2);
    t.decimal('Discount_Percentage', 5, 2).defaultTo(0);
    t.decimal('Discount_Amount', 10, 2).defaultTo(0);
    t.decimal('Taxable_Value', 15, 2);
    t.decimal('GST_Amount', 15, 2);
    t.decimal('Total_Price', 15, 2);
    t.integer('Supplier_ID').references('Vendor_ID').inTable('tbl_vendor_master').onDelete('SET NULL');
    t.integer('Karigar_ID').references('Vendor_ID').inTable('tbl_vendor_master').onDelete('SET NULL');
    t.decimal('Purchase_Cost', 15, 2).notNullable();
    t.integer('Stock_Quantity').defaultTo(1);
    t.integer('Min_Stock_Level').defaultTo(5);
    t.string('Physical_Location', 50);
    t.string('Hallmark_Certificate_No', 50);
    t.date('Hallmark_Date');
    t.boolean('Is_Sold').defaultTo(false);
    t.boolean('Is_Returned').defaultTo(false);
    t.boolean('Is_Active').defaultTo(true);
    t.boolean('Is_Stock_Available').defaultTo(true);
    t.boolean('Is_On_Display').defaultTo(false);
    t.boolean('Is_Reserved').defaultTo(false);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.string('Last_Updated_By', 50);
    t.timestamp('Last_Updated_Date').defaultTo(knex.fn.now());
    t.date('Last_Physical_Verify_Date');
    t.text('Special_Instructions');
    t.string('Certification_Image_URL', 500);
    t.string('Product_Image_URL', 500);
    t.text('QR_Code_Data');
    // Indexes
    t.index(['Tenant_ID'], 'idx_ornament_tenant');
    t.index(['Article_Number'], 'idx_ornament_article');
    t.index(['Is_Active', 'Is_Sold'], 'idx_ornament_active');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_ornament_master');
  await knex.schema.dropTableIfExists('tbl_customer_master');
  await knex.schema.dropTableIfExists('tbl_vendor_master');
  await knex.schema.dropTableIfExists('tbl_user_master');
  await knex.schema.dropTableIfExists('tbl_license_master');
};
