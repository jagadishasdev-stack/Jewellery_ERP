/**
 * Chart of Accounts — the missing piece behind the accounting journal that
 * already existed (tbl_accounting_journal/tbl_accounting_entries, wired up
 * from sales.js only). Entries so far post against a free-text
 * `Ledger_Account` string with no real account behind it — no grouping, no
 * enforced structure, and critically no way to give each real bank account
 * its own ledger (they all silently shared one hardcoded "Bank Account"
 * string). This table is that missing structure; a later migration adds
 * Account_ID onto tbl_accounting_entries and backfills the 22 existing rows
 * by matching Ledger_Account text against the accounts seeded here.
 *
 * Account_Group is the 5 standard top-level groups; Account_Sub_Group is
 * the finer bucket used for report placement (which Balance Sheet section,
 * which P&L section) — both free-text by design (not an enum) so a tenant
 * can add accounts under groups this migration didn't anticipate.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_chart_of_accounts', (t) => {
    t.increments('Account_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Account_Code', 20).notNullable();
    t.string('Account_Name', 150).notNullable();
    t.string('Account_Group', 20).notNullable(); // Assets | Liabilities | Capital | Income | Expenses
    t.string('Account_Sub_Group', 40); // e.g. Bank, Cash, Receivable, Payable, Tax Payable, Tax Credit, Inventory, Fixed Asset, Direct Income, Indirect Expense...
    t.boolean('Is_Bank_Account').notNullable().defaultTo(false);
    t.integer('Bank_Account_ID').references('Account_ID').inTable('tbl_bank_account_master').onDelete('SET NULL');
    t.decimal('Opening_Balance', 15, 2).notNullable().defaultTo(0);
    t.string('Opening_Balance_Type', 2).notNullable().defaultTo('Dr'); // Dr | Cr
    // System accounts (Sales, Output CGST, Customer Advance, ...) are
    // auto-created by the posting engine the first time they're needed —
    // never deletable, so a tenant can't break their own journal by
    // removing an account something else still posts to.
    t.boolean('Is_System').notNullable().defaultTo(false);
    t.boolean('Is_Active').notNullable().defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.uuid('Sync_UUID').notNullable().defaultTo(knex.raw('gen_random_uuid()'));
    t.unique(['Sync_UUID']);
    t.unique(['Tenant_ID', 'Account_Name']);
    t.index(['Tenant_ID', 'Account_Group'], 'idx_coa_tenant_group');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_chart_of_accounts');
};
