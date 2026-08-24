/**
 * tbl_purchase_header only ever had Payment_Mode (free text) — no way to
 * tie a "Bank Transfer"/"Cheque"/etc. purchase payment to a REAL bank
 * account, so postPurchaseAccountingEntries() always fell back to the
 * shared "Unassigned" bank ledger no matter which bank actually paid the
 * supplier. sales.js/karigar.js/pawnbroking.js/repair.js/hr.js already
 * carry a Bank_Account_ID through to resolveLedgerForPayment() — this
 * brings purchase.js in line with the same pattern.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_purchase_header', (t) => {
    t.integer('Bank_Account_ID').references('Account_ID').inTable('tbl_bank_account_master').onDelete('SET NULL');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_purchase_header', (t) => {
    t.dropColumn('Bank_Account_ID');
  });
};
