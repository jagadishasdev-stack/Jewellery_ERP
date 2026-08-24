/**
 * Savings Scheme Adjustment Module for POS Billing — Phase 1.
 *
 * server/src/routes/sales.js's postSaleAccountingEntries() and
 * savingsScheme.js's scheme accounting already write to
 * tbl_accounting_journal / tbl_accounting_entries / tbl_scheme_accounting_entries
 * (and reports.js's /accounting-journal, /ledger, /day-book, /cash-book already
 * read from them) — it turns out these three tables already exist in this
 * database (created by an earlier ad-hoc script, untracked by knex), so this
 * migration does NOT recreate them. It only adds the one column
 * postSaleAccountingEntries() actually needs that's missing from the live
 * tbl_accounting_entries table (Entry_Date), plus the columns needed for
 * real, partial, multi-scheme POS adjustments.
 */
exports.up = async function (knex) {
  // postSaleAccountingEntries() inserts Entry_Date on every entry row, but
  // the existing (pre-created) table doesn't have that column yet.
  const entriesCols = await knex('tbl_accounting_entries').columnInfo();
  if (!entriesCols.Entry_Date) {
    await knex.schema.alterTable('tbl_accounting_entries', (t) => {
      t.date('Entry_Date');
    });
  }

  // ── Real partial-use tracking on scheme members ──────────────────────────
  await knex.schema.alterTable('tbl_scheme_members', (t) => {
    t.decimal('Amount_Redeemed', 15, 2).notNullable().defaultTo(0);
    // Running total already used at POS — lets a scheme be partially used
    // without force-closing it (unlike the old legacy-table behavior).
  });

  // ── Old Gold Voucher Number — reviving the existing, unused table ────────
  await knex.schema.alterTable('tbl_old_gold_exchange', (t) => {
    t.string('Voucher_Number', 30).unique();
    t.smallint('Data_Mode').notNullable().defaultTo(3);
  });

  // ── Bonus as its own deduction line on the sale ──────────────────────────
  await knex.schema.alterTable('tbl_sales_header', (t) => {
    t.decimal('Bonus_Adjustment_Amount', 15, 2).notNullable().defaultTo(0);
  });

  // ── Per-tenant admin toggle for active (not-yet-matured) scheme use ──────
  await knex.schema.createTable('tbl_scheme_settings', (t) => {
    t.increments('Setting_ID').primary();
    t.string('Tenant_ID', 20).notNullable().unique().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.boolean('Allow_Active_Scheme_Adjustment').notNullable().defaultTo(false);
    t.boolean('Allow_Active_Scheme_Bonus').notNullable().defaultTo(false);
    t.string('Updated_By', 50);
    t.timestamp('Updated_Date').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_scheme_settings');
  await knex.schema.alterTable('tbl_sales_header', (t) => {
    t.dropColumn('Bonus_Adjustment_Amount');
  });
  await knex.schema.alterTable('tbl_old_gold_exchange', (t) => {
    t.dropColumn('Voucher_Number');
    t.dropColumn('Data_Mode');
  });
  await knex.schema.alterTable('tbl_scheme_members', (t) => {
    t.dropColumn('Amount_Redeemed');
  });
  // Deliberately not dropping Entry_Date from tbl_accounting_entries or the
  // ledger tables themselves — this migration didn't create them.
};
