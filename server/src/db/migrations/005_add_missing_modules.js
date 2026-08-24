/**
 * Migration 005: Floor Management, Purchase, Repair, Accounting, Saving Scheme
 */
exports.up = async function (knex) {

  // ─── 1. tbl_floor_master ──────────────────────────────────────────────────
  await knex.schema.createTable('tbl_floor_master', (t) => {
    t.increments('Floor_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).notNullable().references('Branch_ID').inTable('tbl_branch_master').onDelete('CASCADE');
    t.string('Floor_Code', 20).notNullable();
    t.string('Floor_Name', 100).notNullable();     // 'Ground Floor - Gold Section'
    t.integer('Floor_Number').defaultTo(0);
    t.string('Description', 200);
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Branch_ID', 'Floor_Code']);
  });

  // ─── 2. tbl_counter_master ────────────────────────────────────────────────
  await knex.schema.createTable('tbl_counter_master', (t) => {
    t.increments('Counter_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).notNullable().references('Branch_ID').inTable('tbl_branch_master').onDelete('CASCADE');
    t.integer('Floor_ID').notNullable().references('Floor_ID').inTable('tbl_floor_master').onDelete('CASCADE');
    t.string('Counter_Code', 20).notNullable();
    t.string('Counter_Name', 100).notNullable();   // 'Counter A', 'Showcase 1'
    t.string('Counter_Type', 30).defaultTo('Showcase'); // Showcase, Tray, Vault
    t.integer('Capacity').defaultTo(50);
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Branch_ID', 'Floor_ID', 'Counter_Code']);
  });

  // ─── 3. tbl_floor_stock_transfer ──────────────────────────────────────────
  // Tracks movement: Branch Transfer or Floor/Counter Transfer
  await knex.schema.createTable('tbl_stock_transfer', (t) => {
    t.bigIncrements('Transfer_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Transfer_Number', 30).unique().notNullable();
    t.string('Transfer_Type', 20).notNullable(); // 'Floor', 'Branch', 'Counter'
    t.timestamp('Transfer_Date').defaultTo(knex.fn.now());

    // Source
    t.string('From_Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.integer('From_Floor_ID').references('Floor_ID').inTable('tbl_floor_master').onDelete('SET NULL');
    t.integer('From_Counter_ID').references('Counter_ID').inTable('tbl_counter_master').onDelete('SET NULL');

    // Destination
    t.string('To_Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.integer('To_Floor_ID').references('Floor_ID').inTable('tbl_floor_master').onDelete('SET NULL');
    t.integer('To_Counter_ID').references('Counter_ID').inTable('tbl_counter_master').onDelete('SET NULL');

    t.string('Status', 20).defaultTo('Pending'); // Pending, Approved, Completed, Rejected
    t.string('Approved_By', 50);
    t.timestamp('Approved_Date');
    t.text('Remarks');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Status'], 'idx_transfer_status');
  });

  // ─── 4. tbl_stock_transfer_items ─────────────────────────────────────────
  await knex.schema.createTable('tbl_stock_transfer_items', (t) => {
    t.bigIncrements('Item_ID').primary();
    t.bigInteger('Transfer_ID').notNullable().references('Transfer_ID').inTable('tbl_stock_transfer').onDelete('CASCADE');
    t.bigInteger('Ornament_ID').references('Ornament_ID').inTable('tbl_ornament_master').onDelete('SET NULL');
    t.string('Article_Number', 50);
    t.decimal('Gross_Weight', 10, 3);
    t.string('Status', 20).defaultTo('Pending'); // Pending, Received, Rejected
    t.text('Remarks');
  });

  // ─── 5. tbl_purchase_header ───────────────────────────────────────────────
  await knex.schema.createTable('tbl_purchase_header', (t) => {
    t.bigIncrements('Purchase_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Purchase_Number', 30).unique().notNullable();
    t.timestamp('Purchase_Date').defaultTo(knex.fn.now());
    t.integer('Supplier_ID').references('Vendor_ID').inTable('tbl_vendor_master').onDelete('SET NULL');
    t.string('Supplier_Name', 100);
    t.string('Supplier_Invoice_No', 50);
    t.date('Supplier_Invoice_Date');
    t.string('Purchase_Type', 20).defaultTo('Stock'); // Stock, Consignment, Old Gold
    t.decimal('Total_Gross_Weight', 10, 3).defaultTo(0);
    t.decimal('Total_Net_Weight', 10, 3).defaultTo(0);
    t.decimal('Subtotal_Amount', 15, 2).defaultTo(0);
    t.decimal('GST_Amount', 15, 2).defaultTo(0);
    t.decimal('Total_Amount', 15, 2).notNullable();
    t.decimal('Amount_Paid', 15, 2).defaultTo(0);
    t.decimal('Balance_Amount', 15, 2).defaultTo(0);
    t.string('Payment_Status', 20).defaultTo('Pending');
    t.string('Payment_Mode', 20);
    t.string('Status', 20).defaultTo('Draft'); // Draft, Approved, Received, Cancelled
    t.string('Approved_By', 50);
    t.timestamp('Approved_Date');
    t.text('Notes');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Purchase_Date'], 'idx_purchase_date');
  });

  // ─── 6. tbl_purchase_details ──────────────────────────────────────────────
  await knex.schema.createTable('tbl_purchase_details', (t) => {
    t.bigIncrements('Detail_ID').primary();
    t.bigInteger('Purchase_ID').notNullable().references('Purchase_ID').inTable('tbl_purchase_header').onDelete('CASCADE');
    t.string('Tenant_ID', 20).notNullable();
    t.bigInteger('Ornament_ID').references('Ornament_ID').inTable('tbl_ornament_master').onDelete('SET NULL');
    t.string('Article_Number', 50);
    t.integer('Type_ID').references('Type_ID').inTable('tbl_item_type_master').onDelete('SET NULL');
    t.string('Item_Description', 200);
    t.integer('Quantity').defaultTo(1);
    t.decimal('Gross_Weight', 10, 3);
    t.decimal('Stone_Weight', 10, 3).defaultTo(0);
    t.decimal('Net_Weight', 10, 3);
    t.string('Purity_Code', 10);
    t.decimal('Gold_Rate', 10, 2);
    t.decimal('Making_Charge', 10, 2);
    t.decimal('Stone_Value', 10, 2).defaultTo(0);
    t.decimal('Purchase_Rate', 15, 2).notNullable();
    t.decimal('Total_Line_Value', 15, 2).notNullable();
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  // ─── 7. tbl_repair_orders ─────────────────────────────────────────────────
  await knex.schema.createTable('tbl_repair_orders', (t) => {
    t.bigIncrements('Repair_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Job_Card_Number', 30).unique().notNullable();
    t.timestamp('Received_Date').defaultTo(knex.fn.now());
    t.integer('Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('SET NULL');
    t.string('Customer_Name', 100);
    t.string('Customer_Mobile', 15);
    t.string('Item_Description', 200).notNullable(); // 'Gold Necklace', 'Silver Bangle'
    t.string('Item_Type', 50);
    t.decimal('Item_Weight', 10, 3);
    t.string('Purity', 10);
    t.text('Repair_Work_Required');    // Customer description of work
    t.text('Technician_Notes');
    t.integer('Assigned_Karigar_ID').references('Vendor_ID').inTable('tbl_vendor_master').onDelete('SET NULL');
    t.string('Status', 20).defaultTo('Received'); // Received, In-Progress, Ready, Delivered, Cancelled
    t.date('Expected_Delivery');
    t.date('Actual_Delivery');
    t.decimal('Estimate_Amount', 10, 2);
    t.decimal('Labour_Charge', 10, 2).defaultTo(0);
    t.decimal('Material_Charge', 10, 2).defaultTo(0);
    t.decimal('Total_Charge', 10, 2).defaultTo(0);
    t.decimal('Advance_Paid', 10, 2).defaultTo(0);
    t.decimal('Balance_Due', 10, 2).defaultTo(0);
    t.string('Before_Image_URL', 500);
    t.string('After_Image_URL', 500);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Status'], 'idx_repair_status');
  });

  // ─── 8. tbl_saving_scheme_master ──────────────────────────────────────────
  await knex.schema.createTable('tbl_saving_scheme_master', (t) => {
    t.increments('Scheme_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Scheme_Code', 20).notNullable();
    t.string('Scheme_Name', 100).notNullable();   // 'Gold Savings 11+1', 'Silver Plan'
    t.string('Metal_Type', 20).defaultTo('Gold'); // Gold, Silver, Diamond
    t.integer('Duration_Months').notNullable();    // 11 months
    t.integer('Free_Months').defaultTo(1);         // 1 month company bonus
    t.decimal('Monthly_Amount', 10, 2).notNullable();
    t.decimal('Bonus_Percent', 5, 2).defaultTo(0);
    t.text('Terms');
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Scheme_Code']);
  });

  // ─── 9. tbl_saving_scheme_enrollment ─────────────────────────────────────
  await knex.schema.createTable('tbl_saving_scheme_enrollment', (t) => {
    t.bigIncrements('Enrollment_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Scheme_ID').references('Scheme_ID').inTable('tbl_saving_scheme_master').onDelete('SET NULL');
    t.integer('Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('SET NULL');
    t.string('Enrollment_Number', 30).unique().notNullable();
    t.date('Start_Date').notNullable();
    t.date('Maturity_Date');
    t.decimal('Monthly_Amount', 10, 2).notNullable();
    t.integer('Installments_Paid').defaultTo(0);
    t.integer('Total_Installments').notNullable();
    t.decimal('Total_Amount_Paid', 15, 2).defaultTo(0);
    t.decimal('Bonus_Amount', 10, 2).defaultTo(0);
    t.decimal('Maturity_Value', 15, 2).defaultTo(0);
    t.string('Status', 20).defaultTo('Active'); // Active, Matured, Redeemed, Closed
    t.date('Redemption_Date');
    t.bigInteger('Redemption_Sale_ID').references('Sale_ID').inTable('tbl_sales_header').onDelete('SET NULL');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
  });

  // ─── 10. tbl_scheme_installments ─────────────────────────────────────────
  await knex.schema.createTable('tbl_scheme_installments', (t) => {
    t.bigIncrements('Installment_ID').primary();
    t.bigInteger('Enrollment_ID').notNullable().references('Enrollment_ID').inTable('tbl_saving_scheme_enrollment').onDelete('CASCADE');
    t.string('Tenant_ID', 20).notNullable();
    t.integer('Installment_No').notNullable();
    t.date('Due_Date').notNullable();
    t.date('Paid_Date');
    t.decimal('Amount', 10, 2).notNullable();
    t.string('Payment_Mode', 20);
    t.string('Receipt_Number', 30);
    t.string('Status', 20).defaultTo('Pending'); // Pending, Paid, Overdue
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  // ─── 11. tbl_gold_rate_history ────────────────────────────────────────────
  await knex.schema.createTable('tbl_gold_rate_history', (t) => {
    t.bigIncrements('Rate_ID').primary();
    t.string('Tenant_ID', 20).references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.date('Rate_Date').notNullable();
    t.decimal('Rate_22K', 10, 2);
    t.decimal('Rate_24K', 10, 2);
    t.decimal('Rate_18K', 10, 2);
    t.decimal('Rate_Silver', 10, 2);
    t.decimal('Rate_Platinum', 10, 2);
    t.string('Source', 20).defaultTo('Manual'); // Manual, API
    t.string('Set_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Rate_Date'], 'idx_rate_date');
  });

  // ─── 12. tbl_custom_order ─────────────────────────────────────────────────
  await knex.schema.createTable('tbl_custom_order', (t) => {
    t.bigIncrements('Order_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Order_Number', 30).unique().notNullable();
    t.timestamp('Order_Date').defaultTo(knex.fn.now());
    t.integer('Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('SET NULL');
    t.string('Customer_Name', 100);
    t.string('Customer_Mobile', 15);
    t.text('Item_Description');
    t.decimal('Estimated_Weight', 10, 3);
    t.decimal('Estimated_Amount', 15, 2);
    t.decimal('Advance_Amount', 15, 2).defaultTo(0);
    t.date('Expected_Delivery');
    t.integer('Assigned_Karigar_ID').references('Vendor_ID').inTable('tbl_vendor_master').onDelete('SET NULL');
    t.string('Status', 20).defaultTo('Pending'); // Pending, In-Production, Ready, Delivered, Cancelled
    t.text('Remarks');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_custom_order');
  await knex.schema.dropTableIfExists('tbl_gold_rate_history');
  await knex.schema.dropTableIfExists('tbl_scheme_installments');
  await knex.schema.dropTableIfExists('tbl_saving_scheme_enrollment');
  await knex.schema.dropTableIfExists('tbl_saving_scheme_master');
  await knex.schema.dropTableIfExists('tbl_repair_orders');
  await knex.schema.dropTableIfExists('tbl_purchase_details');
  await knex.schema.dropTableIfExists('tbl_purchase_header');
  await knex.schema.dropTableIfExists('tbl_stock_transfer_items');
  await knex.schema.dropTableIfExists('tbl_stock_transfer');
  await knex.schema.dropTableIfExists('tbl_counter_master');
  await knex.schema.dropTableIfExists('tbl_floor_master');
};
