/**
 * Migration 021 — Data Mode System
 * Adds Data_Mode SMALLINT to all transaction tables.
 * 1 = Dummy/Practice, 2 = Unofficial ERP, 3 = Official ERP (default)
 * Masters (item types, gemstones, karigar, etc.) are NOT touched — shared across all modes.
 */
const knex = require('./src/db/knex');

const TRANSACTION_TABLES = [
  'tbl_ornament_master',
  'tbl_sales_header',
  'tbl_sales_payments',
  'tbl_purchase_header',
  'tbl_issue_to_karigar',
  'tbl_scheme_members',
  'tbl_scheme_transactions',
  'tbl_scheme_groups',
  'tbl_customer_master',
  'tbl_accounting_journal',
  'tbl_accounting_entries',
  'tbl_stock_transfer',
];

async function run() {
  for (const table of TRANSACTION_TABLES) {
    const exists = await knex.schema.hasTable(table);
    if (!exists) { console.log(`SKIP (no table): ${table}`); continue; }

    const hasCol = await knex.schema.hasColumn(table, 'Data_Mode');
    if (hasCol) { console.log(`SKIP (exists): ${table}.Data_Mode`); continue; }

    await knex.schema.alterTable(table, t => {
      t.smallint('Data_Mode').notNullable().defaultTo(3)
        .comment('1=Dummy, 2=Unofficial, 3=Official');
    });

    // Index for fast filtering
    await knex.schema.raw(
      `CREATE INDEX IF NOT EXISTS idx_${table.replace('tbl_','')}_data_mode ON "${table}"("Data_Mode")`
    );

    console.log(`✓ Added Data_Mode to ${table}`);
  }

  // Existing data is all real/official → set to 3
  for (const table of TRANSACTION_TABLES) {
    const exists = await knex.schema.hasTable(table);
    if (!exists) continue;
    await knex(table).whereNull('Data_Mode').update({ Data_Mode: 3 }).catch(() => {});
  }

  console.log('\nMigration 021 done — Data Mode system ready.');
  process.exit(0);
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
