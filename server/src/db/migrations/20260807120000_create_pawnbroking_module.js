/**
 * Pawnbroking / Gold Loan Module.
 *
 * Ported from the legacy desktop ERP's `pawnbrokin` + `pawnbrokin_interest`
 * tables, but split header/items/transactions the same way the rest of this
 * schema splits header/details — the legacy table crammed loan terms,
 * pledge-item description, and every part-payment into one wide row.
 *
 * tbl_pawn_loan_items is a separate table (not just a text description on
 * the header) because a single loan can be pledged against several distinct
 * pieces, and each piece needs its own weight/purity for valuation and, on
 * redemption, its own return record.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_pawn_loan_header', (t) => {
    t.bigIncrements('Loan_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Loan_Number', 30).unique().notNullable();
    t.integer('Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('SET NULL');
    t.date('Loan_Date').notNullable();
    t.decimal('Total_Gross_Weight', 10, 3).defaultTo(0);
    t.decimal('Total_Net_Weight', 10, 3).defaultTo(0);
    t.decimal('Appraised_Value', 15, 2).notNullable();
    t.decimal('Loan_Amount', 15, 2).notNullable();
    t.decimal('Interest_Rate_Pct', 5, 2).notNullable();
    t.string('Interest_Type', 20).defaultTo('Monthly'); // Monthly | Flat | Reducing
    t.integer('Tenure_Months').defaultTo(12);
    t.date('Due_Date');
    t.decimal('Interest_Paid_Upto_Amount', 15, 2).defaultTo(0);
    t.date('Interest_Paid_Upto_Date');
    t.decimal('Principal_Outstanding', 15, 2);
    t.string('Status', 20).notNullable().defaultTo('Active'); // Active | Redeemed | Overdue | Auctioned
    t.date('Redeemed_Date');
    t.date('Auctioned_Date');
    t.decimal('Auction_Sale_Value', 15, 2);
    t.string('Photo_URL', 500);
    t.string('ID_Proof_URL', 1000);
    t.text('Remarks');
    t.string('Voucher_ID', 50);
    t.smallint('Data_Mode').notNullable().defaultTo(3);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.string('Modified_By', 50);
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Status'], 'idx_pawn_loan_status');
    t.index(['Customer_ID'], 'idx_pawn_loan_customer');
  });

  await knex.schema.createTable('tbl_pawn_loan_items', (t) => {
    t.bigIncrements('Item_ID').primary();
    t.bigInteger('Loan_ID').notNullable().references('Loan_ID').inTable('tbl_pawn_loan_header').onDelete('CASCADE');
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Item_Description', 200).notNullable();
    t.integer('Type_ID').references('Type_ID').inTable('tbl_item_type_master').onDelete('SET NULL');
    t.decimal('Gross_Weight', 10, 3).notNullable();
    t.decimal('Net_Weight', 10, 3).notNullable();
    t.string('Purity_Code', 10);
    t.decimal('Estimated_Value', 15, 2);
    t.string('Item_Photo_URL', 500);
    t.string('Item_Status', 20).notNullable().defaultTo('Pledged'); // Pledged | Returned | Auctioned
    t.date('Returned_Date');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Loan_ID'], 'idx_pawn_items_loan');
  });

  await knex.schema.createTable('tbl_pawn_loan_transactions', (t) => {
    t.bigIncrements('Txn_ID').primary();
    t.bigInteger('Loan_ID').notNullable().references('Loan_ID').inTable('tbl_pawn_loan_header').onDelete('CASCADE');
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Txn_Type', 20).notNullable(); // Interest Receipt | Part Payment | Redemption | Auction | Top-Up
    t.date('Txn_Date').notNullable();
    t.decimal('Interest_Collected', 15, 2).defaultTo(0);
    t.decimal('Principal_Collected', 15, 2).defaultTo(0);
    t.decimal('Total_Amount', 15, 2).notNullable();
    t.decimal('Balance_Due', 15, 2);
    t.string('Payment_Mode', 20);
    t.string('Receipt_Number', 30);
    t.text('Remarks');
    t.string('Voucher_ID', 50);
    t.smallint('Data_Mode').notNullable().defaultTo(3);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Loan_ID'], 'idx_pawn_txn_loan');
  });

  const existingModule = await knex('tbl_erp_modules').where('Module_Key', 'pawnbroking').first();
  if (!existingModule) {
    await knex('tbl_erp_modules').insert({
      Module_Key: 'pawnbroking',
      Module_Name: 'Pawnbroking / Gold Loan',
      Module_Group: 'Finance',
      Sort_Order: 29,
      Is_Core: false,
      Default_Retailer: true,
      Default_Wholesaler: false,
      Default_Manufacturer: false,
      Default_Hybrid: true,
    });
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').where('Module_Key', 'pawnbroking').del();
  await knex.schema.dropTableIfExists('tbl_pawn_loan_transactions');
  await knex.schema.dropTableIfExists('tbl_pawn_loan_items');
  await knex.schema.dropTableIfExists('tbl_pawn_loan_header');
};
