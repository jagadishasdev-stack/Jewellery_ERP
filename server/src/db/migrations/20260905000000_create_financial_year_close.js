/**
 * Financial-year-end close was flagged directly in accounting.js's own
 * balance-sheet route comment ("real retained-earnings closing only
 * happens at financial-year-end (not built yet)") — the Balance Sheet
 * worked around it by rolling the CURRENT (ongoing) FY's P&L into
 * Capital live on every request, but a past year's Income/Expense
 * accounts were never actually zeroed and their profit was never
 * permanently rolled into Retained Earnings. That meant Trial Balance
 * (a genuine since-inception report, unlike Balance Sheet's current-FY-
 * only P&L bolt-on) would accumulate every fiscal year's revenue and
 * expense together forever, and a past year's profit never survived
 * past its own "current FY" window into later years' Balance Sheets.
 */
exports.up = function (knex) {
  return knex.schema.createTable('tbl_financial_year_close', (t) => {
    t.increments('Close_ID').primary();
    t.string('Tenant_ID', 20).notNullable();
    t.date('FY_Start').notNullable();
    t.date('FY_End').notNullable();
    t.decimal('Total_Income', 15, 2).notNullable();
    t.decimal('Total_Expense', 15, 2).notNullable();
    t.decimal('Net_Profit', 15, 2).notNullable();
    t.string('Journal_Reference', 60).notNullable();
    t.string('Closed_By', 50).notNullable();
    t.timestamp('Closed_Date').defaultTo(knex.fn.now());

    t.foreign('Tenant_ID').references('Tenant_ID').inTable('tbl_tenant_master');
    t.index(['Tenant_ID', 'FY_End']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('tbl_financial_year_close');
};
