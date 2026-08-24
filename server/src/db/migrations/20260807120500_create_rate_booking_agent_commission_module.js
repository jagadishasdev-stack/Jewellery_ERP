/**
 * Rate Booking & Agent Commission Module.
 *
 * tbl_rate_booking: ported from legacy `ratecut_entry`/`ratecut_main` — a
 * customer locks today's metal rate for a purchase they'll complete later
 * (common ahead of a price rise or a wedding-date purchase). It is
 * deliberately separate from tbl_tenant_rates/tbl_gold_rate_history, which
 * are the shop's own posted rate-of-the-day, not a per-customer commitment.
 *
 * tbl_agent_commission_transactions: tbl_agent_master already carries a
 * default Commission_Pct, but nothing recorded actual commission earned —
 * this is the transaction ledger, one row per sale or scheme enrollment an
 * agent gets credited for. Source_Type/Source_ID (rather than two nullable
 * FKs) because more source types (e.g. a future referral-based repair order)
 * shouldn't require another schema migration to plug in.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_rate_booking', (t) => {
    t.bigIncrements('Booking_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Booking_Number', 30).unique().notNullable();
    t.integer('Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('SET NULL');
    t.date('Booking_Date').notNullable();
    t.string('Metal_Type', 20).notNullable(); // Gold | Silver | Platinum
    t.string('Purity_Code', 10);
    t.decimal('Booked_Rate', 10, 2).notNullable();
    t.decimal('Weight_Booked', 10, 3).notNullable();
    t.decimal('Advance_Amount', 15, 2).defaultTo(0);
    t.date('Valid_Until').notNullable();
    t.string('Status', 20).notNullable().defaultTo('Open'); // Open | Utilized | Expired | Cancelled
    t.bigInteger('Utilized_Sale_ID').references('Sale_ID').inTable('tbl_sales_header').onDelete('SET NULL');
    t.text('Remarks');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Status'], 'idx_rate_booking_status');
  });

  await knex.schema.createTable('tbl_agent_commission_transactions', (t) => {
    t.bigIncrements('Txn_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Agent_ID').notNullable().references('Agent_ID').inTable('tbl_agent_master').onDelete('CASCADE');
    t.string('Source_Type', 20).notNullable(); // Sale | Scheme
    t.bigInteger('Source_ID').notNullable(); // Sale_ID or Scheme Member_ID depending on Source_Type
    t.decimal('Commission_Base_Amount', 15, 2).notNullable();
    t.decimal('Commission_Pct_Applied', 5, 2).notNullable();
    t.decimal('Commission_Amount', 10, 2).notNullable();
    t.string('Status', 20).notNullable().defaultTo('Pending'); // Pending | Paid
    t.date('Paid_Date');
    t.string('Payment_Reference', 50);
    t.smallint('Data_Mode').notNullable().defaultTo(3);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Agent_ID', 'Status'], 'idx_agent_commission_status');
    t.index(['Source_Type', 'Source_ID'], 'idx_agent_commission_source');
  });

  const existingModule = await knex('tbl_erp_modules').where('Module_Key', 'rate_booking_agent_commission').first();
  if (!existingModule) {
    await knex('tbl_erp_modules').insert({
      Module_Key: 'rate_booking_agent_commission',
      Module_Name: 'Rate Booking & Agent Commission',
      Module_Group: 'Sales',
      Sort_Order: 34,
      Is_Core: false,
      Default_Retailer: true,
      Default_Wholesaler: true,
      Default_Manufacturer: false,
      Default_Hybrid: true,
    });
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').where('Module_Key', 'rate_booking_agent_commission').del();
  await knex.schema.dropTableIfExists('tbl_agent_commission_transactions');
  await knex.schema.dropTableIfExists('tbl_rate_booking');
};
