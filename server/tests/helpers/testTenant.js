/**
 * Provisions and tears down a fully isolated test tenant against the real
 * dev Postgres DB — never runs against DLJ's real data. Everything this
 * creates is scoped to Tenant_ID='QATEST' and deleted in reverse FK order
 * by teardown(); a test run that crashes mid-way leaves an easily
 * recognizable, easily wiped tenant behind, never mixed into real rows.
 */
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../../src/db/knex');
const { STANDARD_ACCOUNTS } = require('../../src/utils/standardChartOfAccounts');

const TENANT_ID = 'QATEST';
const BRANCH_ID = 900001; // clearly out of range of any real seeded/imported branch
const PLAIN_PASSWORD = 'QaTest@2026';

async function setup() {
  await teardown(); // in case a previous crashed run left rows behind

  await db('tbl_tenant_master').insert({
    Tenant_ID: TENANT_ID,
    Company_Name: 'QA Test Tenant',
    Brand_Code: 'QAT',
    Address_Line1: 'Test Address',
    City: 'Test City',
    State: 'Test State',
    Country: 'India',
    License_Key: `QATEST-${uuidv4()}`,
    License_Expiry_Date: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    Business_Type: 'HYBRID', // widest module set, so tests aren't blocked by business-type gating
    Is_Active: true,
  });

  await db('tbl_branch_master').insert({
    Branch_ID: BRANCH_ID,
    Tenant_ID: TENANT_ID,
    Branch_Name: 'QA Head Office',
    Branch_Code: 'QAHO',
    Is_Head_Office: true,
  });

  const clientAdminRole = await db('tbl_role_master').where({ Role_Name: 'Client Admin' }).first();
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(PLAIN_PASSWORD, salt);

  const [user] = await db('tbl_user_master')
    .insert({
      Tenant_ID: TENANT_ID,
      Username: 'qatest_admin',
      Password_Hash: hash,
      Password_Salt: salt,
      Role_ID: clientAdminRole.Role_ID,
      Full_Name: 'QA Test Admin',
      Is_Active: true,
      Is_Admin: true,
      // Matches how tenant.js's real create-tenant flow creates its admin
      // — a Client Admin defaults to All_Branch_Access=true (see
      // utils/branchAccess.js) so this test user behaves like a real one.
      All_Branch_Access: true,
    })
    .returning('User_ID');

  // Real tenants get this via tenant.js's create-tenant flow (or the
  // backfill migration, for tenants that predate it) — QATEST is created
  // directly, bypassing that route, so it needs the same seed here or
  // every accounting test would be posting against a tenant with no
  // Chart of Accounts at all, unlike any real tenant.
  await db('tbl_chart_of_accounts').insert(
    STANDARD_ACCOUNTS.map((a) => ({
      Tenant_ID: TENANT_ID, Account_Code: a.code, Account_Name: a.name,
      Account_Group: a.group, Account_Sub_Group: a.sub, Is_System: true,
    }))
  );

  return { tenantId: TENANT_ID, branchId: BRANCH_ID, userId: user.User_ID, username: 'qatest_admin', password: PLAIN_PASSWORD };
}

async function teardown() {
  // Children before parents. Every table here is Tenant_ID-scoped, and a
  // couple (subscription, sync log/queue) only exist because earlier test
  // runs created them — deleting unconditionally is safe even if they're
  // already empty.
  //
  // tbl_accounting_journal has NO foreign key to tbl_tenant_master at all
  // (checked directly — confirmed by real leakage: 66+ journals had piled
  // up under QATEST before this fix, since every accounting test run
  // posted real rows that nothing ever cleaned up). tbl_accounting_entries
  // DOES cascade from tbl_accounting_journal, but that's irrelevant if the
  // journal rows themselves are never deleted — delete both explicitly.
  await db('tbl_accounting_entries').whereIn('Journal_ID', db('tbl_accounting_journal').where({ Tenant_ID: TENANT_ID }).select('Journal_ID')).del();
  await db('tbl_accounting_journal').where({ Tenant_ID: TENANT_ID }).del();
  // Same gap as tbl_accounting_journal above — tbl_scheme_accounting_entries
  // (the Savings Scheme module's own shadow ledger table) also has no FK to
  // tbl_tenant_master, confirmed by a real leak: 3 rows from a manual
  // collect + maturity-bonus run survived a full teardown before this line
  // existed.
  await db('tbl_scheme_accounting_entries').where({ Tenant_ID: TENANT_ID }).del();
  // Same gap again — tbl_agent_master (rate-booking referral agents AND
  // savings-scheme field-collection agents share this table) also has no
  // FK to tbl_tenant_master. Its own child table
  // (tbl_agent_commission_transactions) cascades fine from Agent_ID, but
  // that's moot if the agent row itself never gets deleted.
  await db('tbl_agent_master').where({ Tenant_ID: TENANT_ID }).del();
  await db('tbl_tally_sync_log').where({ Tenant_ID: TENANT_ID }).del();
  await db('tbl_tally_config').where({ Tenant_ID: TENANT_ID }).del();
  await db('tbl_financial_year_close').where({ Tenant_ID: TENANT_ID }).del();
  await db('tbl_sync_log').where({ Tenant_ID: TENANT_ID }).del();
  await db('tbl_sync_queue').where({ Tenant_ID: TENANT_ID }).del();
  await db('tbl_tenant_subscription').where({ Tenant_ID: TENANT_ID }).del();
  await db('tbl_sales_details').where({ Tenant_ID: TENANT_ID }).del();
  // Children of tbl_sales_header/tbl_customer_advance — must go before both.
  await db('tbl_customer_advance_application').where({ Tenant_ID: TENANT_ID }).del();
  await db('tbl_customer_advance').where({ Tenant_ID: TENANT_ID }).del();
  await db('tbl_sales_header').where({ Tenant_ID: TENANT_ID }).del();
  await db('tbl_ornament_master').where({ Tenant_ID: TENANT_ID }).del();
  await db('tbl_customer_master').where({ Tenant_ID: TENANT_ID }).del();
  await db('tbl_user_master').where({ Tenant_ID: TENANT_ID }).del();
  await db('tbl_branch_master').where({ Tenant_ID: TENANT_ID }).del();
  await db('tbl_tenant_master').where({ Tenant_ID: TENANT_ID }).del();
}

module.exports = { setup, teardown, TENANT_ID, BRANCH_ID, PLAIN_PASSWORD };
