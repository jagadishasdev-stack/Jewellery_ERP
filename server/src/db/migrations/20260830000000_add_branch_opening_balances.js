/**
 * Branch-specific opening balances — makes Trial Balance / Cash Book /
 * Bank Book genuinely correct when branch-filtered (see accounting.js's
 * own comments on why they were deliberately left unfiltered before this:
 * tbl_chart_of_accounts.Opening_Balance is per-account, TENANT-WIDE only).
 *
 * Deliberately NOT a column added to tbl_chart_of_accounts — an account's
 * opening balance can differ per branch (each branch's cash-in-hand/bank
 * balance/etc. at go-live is its own real number), so this needs its own
 * (Account_ID, Branch_ID) row, not a single extra column.
 *
 * No backfill: every existing account's branch-specific balance starts at
 * 0/Dr (accounting.js's own query already treats a missing row as 0, so
 * this table doesn't even need pre-seeded rows) — deliberately NOT
 * defaulted to the account's tenant-wide Opening_Balance for every
 * branch, which would silently multiply that balance once per branch and
 * make "All Branches" (still reading the tenant-wide figure directly,
 * unchanged) disagree with the sum of the per-branch figures. An owner
 * who wants branch-filtered Trial Balance/Cash Book/Bank Book has to
 * actually allocate each account's real opening balance across branches
 * once, the same way they'd do it in any real accounting system — this
 * table is where that allocation lives.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_account_branch_opening_balance', (t) => {
    t.increments('Balance_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Account_ID').notNullable().references('Account_ID').inTable('tbl_chart_of_accounts').onDelete('CASCADE');
    t.string('Branch_ID', 20).notNullable().references('Branch_ID').inTable('tbl_branch_master').onDelete('CASCADE');
    t.decimal('Opening_Balance', 15, 2).notNullable().defaultTo(0);
    t.string('Opening_Balance_Type', 2).notNullable().defaultTo('Dr'); // 'Dr' | 'Cr'
    t.string('Created_By', 100).nullable();
    t.timestamp('Created_Date', { useTz: true }).defaultTo(knex.fn.now());
    t.string('Modified_By', 100).nullable();
    t.timestamp('Modified_Date', { useTz: true }).nullable();
    t.unique(['Account_ID', 'Branch_ID'], 'uq_account_branch_opening_balance');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_account_branch_opening_balance');
};
