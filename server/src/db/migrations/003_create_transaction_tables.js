/**
 * Migration 003: Transaction Tables
 */
exports.up = async function (knex) {

  // ─── 1. tbl_issue_to_karigar ──────────────────────────────────────────────
  await knex.schema.createTable('tbl_issue_to_karigar', (t) => {
    t.bigIncrements('Issue_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.integer('Karigar_ID').references('Vendor_ID').inTable('tbl_vendor_master').onDelete('SET NULL');
    t.string('Issue_Number', 30).unique().notNullable();
    t.date('Issue_Date').notNullable();
    t.date('Expected_Return_Date');
    t.decimal('Gold_Weight_Issued', 10, 3).notNullable();
    t.integer('Purity_ID').references('Purity_ID').inTable('tbl_purity_master').onDelete('SET NULL');
    t.decimal('Gold_Rate_At_Issue', 10, 2).notNullable();
    t.decimal('Total_Value_Issued', 15, 2);
    t.integer('Design_ID').references('Design_ID').inTable('tbl_design_master').onDelete('SET NULL');
    t.decimal('Wastage_Allowed_Percent', 5, 2).defaultTo(3.00);
    t.decimal('Karigar_Wages_Rate', 10, 2);
    t.decimal('Estimated_Wages', 15, 2);
    t.string('Status', 20).defaultTo('Issued');
    t.date('Return_Date');
    t.decimal('Returned_Weight', 10, 3).defaultTo(0);
    t.decimal('Wastage_Used', 10, 3).defaultTo(0);
    t.decimal('Missing_Weight', 10, 3).defaultTo(0);
    t.decimal('Missing_Value', 15, 2).defaultTo(0);
    t.decimal('Final_Wages_Paid', 15, 2).defaultTo(0);
    t.text('Remarks');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.index(['Karigar_ID', 'Status'], 'idx_issue_karigar');
  });

  // ─── 2. tbl_return_from_karigar ───────────────────────────────────────────
  await knex.schema.createTable('tbl_return_from_karigar', (t) => {
    t.bigIncrements('Return_ID').primary();
    t.bigInteger('Issue_ID').references('Issue_ID').inTable('tbl_issue_to_karigar').onDelete('CASCADE');
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Return_Number', 30).unique().notNullable();
    t.date('Return_Date').notNullable();
    t.bigInteger('Ornament_ID').references('Ornament_ID').inTable('tbl_ornament_master').onDelete('SET NULL');
    t.decimal('Gross_Weight_Returned', 10, 3).notNullable();
    t.decimal('Net_Gold_Weight', 10, 3).notNullable();
    t.decimal('Stone_Weight', 10, 3).defaultTo(0);
    t.decimal('Wastage_Weight', 10, 3).defaultTo(0);
    t.decimal('Wastage_Percentage_Applied', 5, 2);
    t.decimal('Gold_Rate_At_Return', 10, 2);
    t.decimal('Total_Value_Returned', 15, 2);
    t.boolean('Quality_Check_Passed').defaultTo(true);
    t.text('Quality_Remarks');
    t.string('Rejection_Reason', 200);
    t.string('Status', 20).defaultTo('Received');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
  });

  // ─── 3. tbl_sales_header ──────────────────────────────────────────────────
  await knex.schema.createTable('tbl_sales_header', (t) => {
    t.bigIncrements('Sale_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Invoice_Number', 30).notNullable().unique();
    t.timestamp('Sale_Date').defaultTo(knex.fn.now());
    t.integer('Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('SET NULL');
    t.string('Customer_Name', 100);
    t.string('Customer_Mobile', 15);
    t.decimal('Total_Gross_Weight', 10, 3);
    t.decimal('Total_Net_Gold_Weight', 10, 3);
    t.decimal('Total_Stone_Weight', 10, 3).defaultTo(0);
    t.decimal('Subtotal_Amount', 15, 2).notNullable();
    t.decimal('Discount_Amount', 15, 2).defaultTo(0);
    t.decimal('GST_Amount', 15, 2).defaultTo(0);
    t.decimal('GST_Percentage', 5, 2).defaultTo(3.00);
    t.decimal('Round_Off_Amount', 10, 2).defaultTo(0);
    t.decimal('Net_Payable_Amount', 15, 2).notNullable();
    t.string('Payment_Mode', 20);
    t.string('Payment_Reference', 50);
    t.string('Payment_Status', 20).defaultTo('Pending');
    t.decimal('Amount_Paid', 15, 2).defaultTo(0);
    t.decimal('Balance_Amount', 15, 2).defaultTo(0);
    t.decimal('Old_Gold_Exchange_Amount', 15, 2).defaultTo(0);
    t.decimal('Old_Gold_Weight', 10, 3).defaultTo(0);
    t.boolean('Is_Exchange').defaultTo(false);
    t.string('Sale_Type', 20).defaultTo('Retail');
    t.string('Invoice_Type', 20).defaultTo('Tax Invoice');
    t.string('GST_Invoice_No', 50);
    t.date('Delivery_Date');
    t.string('Delivery_Status', 20).defaultTo('Pending');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.text('Notes');
    t.index(['Invoice_Number'], 'idx_sales_invoice');
    t.index(['Customer_ID'], 'idx_sales_customer');
    t.index(['Sale_Date'], 'idx_sales_date');
    t.index(['Tenant_ID'], 'idx_sales_tenant');
  });

  // ─── 4. tbl_sales_details ─────────────────────────────────────────────────
  await knex.schema.createTable('tbl_sales_details', (t) => {
    t.bigIncrements('Detail_ID').primary();
    t.bigInteger('Sale_ID').notNullable().references('Sale_ID').inTable('tbl_sales_header').onDelete('CASCADE');
    t.string('Tenant_ID', 20).notNullable();
    t.bigInteger('Ornament_ID').references('Ornament_ID').inTable('tbl_ornament_master').onDelete('SET NULL');
    t.string('Article_Number', 50);
    t.string('Item_Type_Name', 50);
    t.integer('Quantity').defaultTo(1);
    t.decimal('Gross_Weight', 10, 3);
    t.decimal('Net_Gold_Weight', 10, 3);
    t.decimal('Stone_Weight', 10, 3).defaultTo(0);
    t.string('Purity_Code', 10);
    t.decimal('Gold_Rate_Per_Gram', 10, 2);
    t.decimal('Making_Charge_Applied', 10, 2);
    t.decimal('Wastage_Amount_Applied', 10, 2);
    t.decimal('Discount_Percentage_Applied', 5, 2).defaultTo(0);
    t.decimal('Discount_Amount_Applied', 10, 2).defaultTo(0);
    t.decimal('Taxable_Value', 15, 2);
    t.decimal('GST_Percentage_Applied', 5, 2).defaultTo(3.00);
    t.decimal('GST_Amount', 15, 2).defaultTo(0);
    t.decimal('Total_Line_Price', 15, 2).notNullable();
    t.integer('Serial_No');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  // ─── 5. tbl_old_gold_exchange ─────────────────────────────────────────────
  await knex.schema.createTable('tbl_old_gold_exchange', (t) => {
    t.bigIncrements('Exchange_ID').primary();
    t.bigInteger('Sale_ID').references('Sale_ID').inTable('tbl_sales_header').onDelete('SET NULL');
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('SET NULL');
    t.timestamp('Exchange_Date').defaultTo(knex.fn.now());
    t.decimal('Old_Gold_Weight', 10, 3).notNullable();
    t.string('Old_Gold_Purity_Code', 10);
    t.decimal('Purity_Percentage', 5, 2);
    t.decimal('Melting_Deduction_Percent', 5, 2).defaultTo(2.00);
    t.decimal('Melting_Deduction_Weight', 10, 3);
    t.decimal('Net_Exchange_Weight', 10, 3);
    t.decimal('Gold_Rate_At_Exchange', 10, 2);
    t.decimal('Total_Value', 15, 2).notNullable();
    t.decimal('Used_Amount', 15, 2).defaultTo(0);
    t.decimal('Balance_Amount', 15, 2).defaultTo(0);
    t.string('Certificate_No', 50);
    t.string('Tested_By', 50);
    t.text('Remarks');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_old_gold_exchange');
  await knex.schema.dropTableIfExists('tbl_sales_details');
  await knex.schema.dropTableIfExists('tbl_sales_header');
  await knex.schema.dropTableIfExists('tbl_return_from_karigar');
  await knex.schema.dropTableIfExists('tbl_issue_to_karigar');
};
