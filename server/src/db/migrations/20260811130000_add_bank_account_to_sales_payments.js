/**
 * tbl_sales_payments already had a free-text Bank_Name field for
 * bank-type payments, but nothing tying a payment to a REAL bank account
 * — so postSaleAccountingEntries() had no way to post it against that
 * specific bank's own ledger, only the shared "Unassigned" fallback every
 * bank-type payment used until now (see accountingEngine.js's per-bank
 * balance sync, which this is what actually lets bank-mode payments use).
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_sales_payments', (t) => {
    t.integer('Bank_Account_ID').references('Account_ID').inTable('tbl_bank_account_master').onDelete('SET NULL');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_sales_payments', (t) => {
    t.dropColumn('Bank_Account_ID');
  });
};
