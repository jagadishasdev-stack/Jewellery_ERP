/**
 * Migration 007:
 * - tbl_tenant_rates    — per-tenant gold/silver/platinum rates
 * - Add Store_Type to tbl_tenant_master (Retailer/Wholesaler/Manufacturer/Hybrid)
 * - Add daily stats summary to tbl_tenant_master for Super Admin dashboard
 */
exports.up = async function (knex) {

  // ─── Per-tenant metal rates ───────────────────────────────────────────────
  await knex.schema.createTable('tbl_tenant_rates', (t) => {
    t.increments('Rate_ID').primary();
    t.string('Tenant_ID', 20).notNullable()
      .references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.date('Rate_Date').notNullable();
    t.decimal('Rate_24K', 10, 2).defaultTo(0);
    t.decimal('Rate_22K', 10, 2).defaultTo(0);
    t.decimal('Rate_18K', 10, 2).defaultTo(0);
    t.decimal('Rate_14K', 10, 2).defaultTo(0);
    t.decimal('Rate_Silver_999', 10, 2).defaultTo(0);
    t.decimal('Rate_Silver_925', 10, 2).defaultTo(0);
    t.decimal('Rate_Platinum', 10, 2).defaultTo(0);
    t.string('Set_By', 50);
    t.string('Source', 20).defaultTo('Manual'); // Manual, API, Broadcast
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Rate_Date'], 'uq_tenant_rate_date');
    t.index(['Tenant_ID', 'Rate_Date'], 'idx_tenant_rate_lookup');
  });

  // ─── Store type and live stats on tenant master ───────────────────────────
  await knex.schema.alterTable('tbl_tenant_master', (t) => {
    t.string('Store_Type', 20).defaultTo('Retailer');
    // 'Retailer' | 'Wholesaler' | 'Manufacturer' | 'Hybrid'
    t.decimal('Today_Sales_Amount', 15, 2).defaultTo(0);
    t.integer('Today_Sales_Count').defaultTo(0);
    t.decimal('Stock_Value', 15, 2).defaultTo(0);
    t.integer('Active_User_Count').defaultTo(0);
    t.timestamp('Last_Stats_Updated');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_tenant_master', (t) => {
    t.dropColumn('Store_Type');
    t.dropColumn('Today_Sales_Amount');
    t.dropColumn('Today_Sales_Count');
    t.dropColumn('Stock_Value');
    t.dropColumn('Active_User_Count');
    t.dropColumn('Last_Stats_Updated');
  });
  await knex.schema.dropTableIfExists('tbl_tenant_rates');
};
