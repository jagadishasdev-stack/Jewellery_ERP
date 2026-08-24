/**
 * Migration 010: Complete Master Tables
 * Collection, Brand, Sub-Category, Diamond masters,
 * Making Charge master, Gold Rate History, Gift Voucher,
 * Loyalty Points, Day Close, enhanced ornament fields
 */
exports.up = async function (knex) {

  // ── Collection Master ─────────────────────────────────────────────────────
  await knex.schema.createTable('tbl_collection_master', (t) => {
    t.increments('Collection_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Collection_Code', 30).notNullable();
    t.string('Collection_Name', 100).notNullable();
    t.string('Season', 50);           // 'Wedding 2026', 'Diwali Collection'
    t.string('Year', 10);
    t.text('Description');
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Collection_Code']);
  });

  // ── Sub Category Master ───────────────────────────────────────────────────
  await knex.schema.createTable('tbl_sub_category_master', (t) => {
    t.increments('SubCat_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Type_ID').references('Type_ID').inTable('tbl_item_type_master').onDelete('SET NULL');
    t.string('SubCat_Code', 30).notNullable();
    t.string('SubCat_Name', 100).notNullable();
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'SubCat_Code']);
  });

  // ── Brand Master ──────────────────────────────────────────────────────────
  await knex.schema.createTable('tbl_brand_master', (t) => {
    t.increments('Brand_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Brand_Code', 30).notNullable();
    t.string('Brand_Name', 100).notNullable();
    t.string('Logo_URL', 500);
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Brand_Code']);
  });

  // ── Making Charge Master ──────────────────────────────────────────────────
  await knex.schema.createTable('tbl_making_charge_master', (t) => {
    t.increments('MC_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('MC_Name', 100).notNullable();
    t.string('Charge_Type', 20).defaultTo('Per Gram');
    // Per Gram | Fixed | Percentage | Per Piece
    t.decimal('Charge_Value', 10, 2).notNullable();
    t.integer('Type_ID').references('Type_ID').inTable('tbl_item_type_master').onDelete('SET NULL');
    t.string('Purity_Code', 10);
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  // ── Diamond Masters ───────────────────────────────────────────────────────
  await knex.schema.createTable('tbl_diamond_quality_master', (t) => {
    t.increments('Quality_ID').primary();
    t.string('Quality_Code', 20).unique().notNullable();
    t.string('Quality_Name', 50).notNullable(); // IF, VVS1, VVS2, VS1, SI1
    t.text('Description');
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tbl_diamond_color_master', (t) => {
    t.increments('Color_ID').primary();
    t.string('Color_Code', 10).unique().notNullable(); // D, E, F, G, H
    t.string('Color_Name', 50).notNullable();
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tbl_diamond_shape_master', (t) => {
    t.increments('Shape_ID').primary();
    t.string('Shape_Code', 20).unique().notNullable();
    t.string('Shape_Name', 50).notNullable(); // Round, Princess, Oval, Cushion
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  // ── HUID / Hallmark Master ────────────────────────────────────────────────
  await knex.schema.createTable('tbl_huid_master', (t) => {
    t.bigIncrements('HUID_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('HUID_Number', 50).unique().notNullable();
    t.bigInteger('Ornament_ID').references('Ornament_ID').inTable('tbl_ornament_master').onDelete('SET NULL');
    t.string('Article_Number', 50);
    t.string('Purity_Code', 10);
    t.decimal('Weight', 10, 3);
    t.string('Assay_Centre', 100);
    t.date('Hallmark_Date');
    t.string('Certificate_URL', 500);
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'HUID_Number'], 'idx_huid_number');
  });

  // ── Gift Voucher Master ───────────────────────────────────────────────────
  await knex.schema.createTable('tbl_gift_vouchers', (t) => {
    t.increments('Voucher_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Voucher_Code', 50).unique().notNullable();
    t.decimal('Voucher_Value', 10, 2).notNullable();
    t.decimal('Used_Amount', 10, 2).defaultTo(0);
    t.decimal('Balance_Amount', 10, 2).notNullable();
    t.date('Issue_Date').notNullable();
    t.date('Expiry_Date');
    t.integer('Issued_To_Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('SET NULL');
    t.bigInteger('Used_In_Sale_ID').references('Sale_ID').inTable('tbl_sales_header').onDelete('SET NULL');
    t.string('Status', 20).defaultTo('Active'); // Active | Used | Expired | Cancelled
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Voucher_Code'], 'idx_voucher_code');
  });

  // ── Loyalty Points Master ─────────────────────────────────────────────────
  await knex.schema.createTable('tbl_loyalty_transactions', (t) => {
    t.bigIncrements('Loyalty_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('CASCADE');
    t.string('Txn_Type', 20).notNullable(); // Earned | Redeemed | Expired | Adjusted
    t.decimal('Points', 10, 2).notNullable();
    t.decimal('Running_Balance', 10, 2).notNullable();
    t.bigInteger('Sale_ID').references('Sale_ID').inTable('tbl_sales_header').onDelete('SET NULL');
    t.text('Description');
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Customer_ID'], 'idx_loyalty_customer');
  });

  // ── Day Close / Cash Verification ─────────────────────────────────────────
  await knex.schema.createTable('tbl_day_close', (t) => {
    t.increments('Close_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.date('Close_Date').notNullable();
    t.decimal('Opening_Cash', 15, 2).defaultTo(0);
    t.decimal('Cash_Sales', 15, 2).defaultTo(0);
    t.decimal('UPI_Sales', 15, 2).defaultTo(0);
    t.decimal('Card_Sales', 15, 2).defaultTo(0);
    t.decimal('Other_Sales', 15, 2).defaultTo(0);
    t.decimal('Total_Sales', 15, 2).defaultTo(0);
    t.decimal('Cash_Expenses', 15, 2).defaultTo(0);
    t.decimal('Cash_In_Hand', 15, 2).defaultTo(0);
    t.decimal('Verified_Cash', 15, 2).defaultTo(0);
    t.decimal('Difference', 15, 2).defaultTo(0);
    t.string('Status', 20).defaultTo('Open'); // Open | Closed | Verified
    t.integer('Closed_By').references('User_ID').inTable('tbl_user_master').onDelete('SET NULL');
    t.timestamp('Closed_At');
    t.text('Remarks');
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Branch_ID', 'Close_Date']);
  });

  // ── Multi-payment support for sales ──────────────────────────────────────
  await knex.schema.createTable('tbl_sales_payments', (t) => {
    t.bigIncrements('Payment_ID').primary();
    t.bigInteger('Sale_ID').notNullable().references('Sale_ID').inTable('tbl_sales_header').onDelete('CASCADE');
    t.string('Tenant_ID', 20).notNullable();
    t.string('Payment_Mode', 30).notNullable();
    t.decimal('Amount', 15, 2).notNullable();
    t.string('Reference', 100);
    t.string('Bank_Name', 100);
    t.string('Cheque_Number', 50);
    t.integer('Voucher_ID').references('Voucher_ID').inTable('tbl_gift_vouchers').onDelete('SET NULL');
    t.bigInteger('Scheme_Enrollment_ID');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Sale_ID'], 'idx_sale_payments');
  });

  // ── Add missing columns to tbl_sales_header ───────────────────────────────
  await knex.schema.alterTable('tbl_sales_header', (t) => {
    t.string('PAN_Number', 20).nullable();
    t.boolean('PAN_Verified').defaultTo(false);
    t.decimal('Loyalty_Points_Used', 10, 2).defaultTo(0);
    t.decimal('Loyalty_Points_Earned', 10, 2).defaultTo(0);
    t.decimal('Voucher_Amount', 10, 2).defaultTo(0);
    t.decimal('Scheme_Adjustment_Amount', 10, 2).defaultTo(0);
    t.string('HUID_Numbers', 500); // comma-separated for this invoice
  });

  // ── Add HUID and Collection to ornament master ────────────────────────────
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    t.string('HUID_Number', 50).nullable();
    t.integer('Collection_ID').references('Collection_ID').inTable('tbl_collection_master').onDelete('SET NULL');
    t.integer('Brand_ID').references('Brand_ID').inTable('tbl_brand_master').onDelete('SET NULL');
    t.integer('SubCat_ID').references('SubCat_ID').inTable('tbl_sub_category_master').onDelete('SET NULL');
    t.string('RFID_Tag', 100).nullable();
    t.integer('MC_ID').references('MC_ID').inTable('tbl_making_charge_master').onDelete('SET NULL');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    ['HUID_Number','Collection_ID','Brand_ID','SubCat_ID','RFID_Tag','MC_ID'].forEach(c => t.dropColumn(c));
  });
  await knex.schema.alterTable('tbl_sales_header', (t) => {
    ['PAN_Number','PAN_Verified','Loyalty_Points_Used','Loyalty_Points_Earned','Voucher_Amount','Scheme_Adjustment_Amount','HUID_Numbers'].forEach(c => t.dropColumn(c));
  });
  const tables = ['tbl_sales_payments','tbl_day_close','tbl_loyalty_transactions',
    'tbl_gift_vouchers','tbl_huid_master','tbl_diamond_shape_master',
    'tbl_diamond_color_master','tbl_diamond_quality_master','tbl_making_charge_master',
    'tbl_brand_master','tbl_sub_category_master','tbl_collection_master'];
  for (const t of tables) await knex.schema.dropTableIfExists(t);
};
