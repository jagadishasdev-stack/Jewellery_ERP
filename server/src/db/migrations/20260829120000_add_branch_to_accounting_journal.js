/**
 * Multi-Branch Management §21/23-24/29 — the double-entry accounting core
 * (tbl_accounting_journal, which every module's postJournal() call feeds:
 * sales, purchase, day close, karigar, repair, pawnbroking, HR, bank
 * cheques...) had no Branch_ID at all, so no financial report built on it
 * (Trial Balance, Day Book, Cash Book, Bank Book, P&L, Balance Sheet)
 * could ever be branch-filtered. Nullable, same convention as everywhere
 * else — existing journals and any caller that doesn't pass a branchId
 * are completely unaffected.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_accounting_journal', (t) => {
    t.string('Branch_ID', 20).nullable().references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.index(['Tenant_ID', 'Branch_ID'], 'idx_journal_tenant_branch');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_accounting_journal', (t) => {
    t.dropIndex(['Tenant_ID', 'Branch_ID'], 'idx_journal_tenant_branch');
    t.dropColumn('Branch_ID');
  });
};
