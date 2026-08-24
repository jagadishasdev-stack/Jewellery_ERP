/**
 * Seeds the standard Chart of Accounts for every tenant that already
 * exists (new tenants get this via tenant.js's create-tenant flow, wired
 * up in the same commit as this migration), one real ledger per existing
 * bank account row, and backfills Account_ID on the accounting entries
 * already posted from real sales (SA_MASTER, CHAM_MYS — checked the live
 * data before writing this: only 6 distinct Ledger_Account strings are in
 * use, all covered below) so historical entries point at a real account
 * instead of being silently orphaned by the new FK.
 */
// Shared with tenant.js's create-tenant flow (server/src/utils/standardChartOfAccounts.js)
// so brand-new tenants get the identical set — deliberately NOT inlined
// twice. Trade-off accepted: editing that shared file later changes what
// a *fresh* `migrate:latest` run would seed here too, but that's the seed
// LIST, not the migration's own logic, and keeping one source of truth
// for it matters more than migration-file immutability for this case.
const { STANDARD_ACCOUNTS } = require('../../utils/standardChartOfAccounts');

exports.up = async function (knex) {
  const tenants = await knex('tbl_tenant_master').select('Tenant_ID');

  for (const { Tenant_ID: tenantId } of tenants) {
    const existingCount = await knex('tbl_chart_of_accounts').where({ Tenant_ID: tenantId }).count('Account_ID as c').first();
    if (parseInt(existingCount.c) > 0) continue; // already seeded (safe to re-run this migration)

    await knex('tbl_chart_of_accounts').insert(
      STANDARD_ACCOUNTS.map((a) => ({
        Tenant_ID: tenantId,
        Account_Code: a.code,
        Account_Name: a.name,
        Account_Group: a.group,
        Account_Sub_Group: a.sub,
        Is_System: true,
      }))
    );

    // One real ledger per existing bank account row for this tenant.
    const banks = await knex('tbl_bank_account_master').where({ Tenant_ID: tenantId, Is_Active: true });
    for (const bank of banks) {
      const label = `${bank.Bank_Name} (${bank.Account_Number})`;
      const existing = await knex('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Account_Name: label }).first();
      if (existing) continue;
      await knex('tbl_chart_of_accounts').insert({
        Tenant_ID: tenantId,
        Account_Code: `10${String(50 + banks.indexOf(bank)).padStart(2, '0')}`,
        Account_Name: label,
        Account_Group: 'Assets',
        Account_Sub_Group: 'Bank',
        Is_Bank_Account: true,
        Bank_Account_ID: bank.Account_ID,
        Opening_Balance: bank.Opening_Balance || 0,
        Is_System: true,
      });
    }
  }

  // Backfill Account_ID on entries already posted, matching by the exact
  // Ledger_Account text each was posted with (confirmed against live data
  // before writing this — only 6 distinct strings, all seeded above; a
  // 7th, the old generic "Bank Account", maps to the Unassigned account).
  const rows = await knex('tbl_accounting_entries').whereNull('Account_ID');
  for (const row of rows) {
    const lookupName = row.Ledger_Account === 'Bank Account'
      ? 'Bank Account (Unassigned — pre-dates per-bank ledgers)'
      : row.Ledger_Account;
    const account = await knex('tbl_chart_of_accounts').where({ Tenant_ID: row.Tenant_ID, Account_Name: lookupName }).first();
    if (account) {
      await knex('tbl_accounting_entries').where({ Entry_ID: row.Entry_ID }).update({ Account_ID: account.Account_ID });
    }
  }
};

exports.down = async function (knex) {
  await knex('tbl_accounting_entries').update({ Account_ID: null });
  await knex('tbl_chart_of_accounts').del();
};
