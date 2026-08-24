/**
 * Adds a real Account_ID to tbl_accounting_entries, pointing at the Chart
 * of Accounts just created. Ledger_Account (the old free-text string)
 * stays — nullable FK, not a replacement column — so the 22 real entries
 * already posted from live sales keep displaying correctly even before
 * they're backfilled (done in the next migration), and so any code that
 * still reads Ledger_Account directly doesn't break.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_accounting_entries', (t) => {
    t.integer('Account_ID').references('Account_ID').inTable('tbl_chart_of_accounts').onDelete('SET NULL');
    t.index(['Account_ID'], 'idx_acct_entries_account');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_accounting_entries', (t) => {
    t.dropColumn('Account_ID');
  });
};
