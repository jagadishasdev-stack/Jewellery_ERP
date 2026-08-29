/**
 * Provisions a brand-new tenant's own dedicated database at creation time
 * (server/src/routes/tenant.js's POST /create), so every tenant going
 * forward gets real per-tenant Postgres isolation from day one — rather
 * than sharing the control-plane DB with everyone, which is what every
 * tenant created before this did (see tenantDbResolver.js's own "Phase 1"
 * doc comment; DB_Host is null for all of them today).
 *
 * A brand-new tenant starts with zero data, which is exactly what makes
 * this safe and simple compared to migrating an EXISTING tenant (see
 * scripts/migrate-dlj-to-own-database.js for that much more careful,
 * one-off, manually-run case) — there's nothing to copy except the global
 * reference data every tenant needs to actually function.
 *
 * GLOBAL REFERENCE DATA — the part that needs real care:
 * Migrations create a full copy of the schema in the new database,
 * including tables that are normally control-plane-only shared reference
 * data (Item Type, Purity, Design, Role, Gemstone, Diamond Quality/Color/
 * Shape, HSN, ERP Modules, Metal Type). Those tables end up EMPTY after a
 * plain `migrate.latest()` — and some tenant-scoped tables have a REAL,
 * enforced foreign key into them (e.g. tbl_user_master.Role_ID references
 * tbl_role_master.Role_ID, WITHIN THE SAME DATABASE — Postgres can't
 * enforce a foreign key across two different physical databases at all).
 * So the admin-user insert during tenant creation would fail its own FK
 * constraint unless the new database's local tbl_role_master copy is
 * seeded first, since the constraint has to be satisfied locally.
 *
 * This function copies ONLY the tables confirmed to be genuinely global,
 * admin-managed reference data with no owning tenant (matching
 * tenantDb.js's own "shared control-plane tables" doc comment, plus the
 * ones this session's Metal Type Master work added) — deliberately NOT
 * every table lacking a Tenant_ID column. Several tables have no direct
 * Tenant_ID column but are still real per-tenant data, scoped indirectly
 * through a tenant-owned parent (tbl_employee_details, tbl_salary_structure,
 * tbl_user_permission_override, tbl_stock_transfer_items, and others) —
 * copying THOSE into a new tenant's database would leak another tenant's
 * real data into it. GLOBAL_REFERENCE_TABLES below is the deliberately
 * narrow, reviewed allowlist; nothing else is ever copied by this
 * function.
 *
 * The app itself never reads these local copies at runtime — role/
 * permission checks, item-type/purity/etc. lookups all explicitly use the
 * control-plane connection (require('../db/knex'), not tenantDb — see
 * auth.js's own "Control-plane connection — tbl_role_master ... always
 * live here" comment). These local copies exist SOLELY to satisfy
 * Postgres's own foreign-key checks on tenant-scoped inserts within that
 * database; a copy going stale after this point (e.g. Super Admin edits a
 * role later) is harmless for that exact reason.
 */
const { Client } = require('pg');
const knexLib = require('knex');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const controlDb = require('../db/knex');

const BASE_CONNECTION = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

// Dependency-safe order — tbl_design_master.Type_ID references
// tbl_item_type_master, so Item Type must be copied first; everything
// else here has no FK to another table in this same list.
const GLOBAL_REFERENCE_TABLES = [
  'tbl_role_master',
  'tbl_item_type_master',
  'tbl_purity_master',
  'tbl_design_master',
  'tbl_gemstone_master',
  'tbl_diamond_quality_master',
  'tbl_diamond_color_master',
  'tbl_diamond_shape_master',
  'tbl_hsn_master',
  'tbl_erp_modules',
  'tbl_metal_type_master',
];

async function createDatabase(dbName) {
  const admin = new Client({ ...BASE_CONNECTION, database: 'postgres' });
  await admin.connect();
  try {
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rows.length === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }
}

async function dropDatabase(dbName) {
  const admin = new Client({ ...BASE_CONNECTION, database: 'postgres' });
  await admin.connect();
  try {
    // Terminate any lingering connections first — DROP DATABASE fails
    // while anything (e.g. this same tenant's own just-opened knex pool)
    // still holds a connection open.
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    );
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  } finally {
    await admin.end();
  }
}

/**
 * Creates a new dedicated Postgres database for `tenantId`, runs the full
 * schema migrations against it, and copies the global reference tables
 * into it. Returns the connection config to store on the tenant's own
 * tbl_tenant_master row (DB_Host/DB_Port/DB_Name/DB_User/DB_Password) and
 * a live knex instance already connected to it, ready for the caller to
 * seed the tenant's own initial data (branch, admin user, etc.) into.
 *
 * On any failure, drops the partially-created database before rethrowing
 * — never leaves an orphaned, half-provisioned database behind.
 */
async function provisionTenantDatabase(tenantId) {
  const dbName = `JewelleryERP_${tenantId}`;
  let tenantKnex;
  try {
    await createDatabase(dbName);

    tenantKnex = knexLib({
      client: 'pg',
      connection: { ...BASE_CONNECTION, database: dbName },
      migrations: { directory: path.join(__dirname, '../db/migrations'), tableName: 'knex_migrations' },
      pool: { min: 1, max: 5 },
    });

    await tenantKnex.migrate.latest();

    // Some migrations seed their own baseline rows into these same global
    // tables as part of `up()` (e.g. tbl_erp_modules, tbl_role_master) —
    // real, previously-untested collision found by actually running this:
    // inserting the control plane's current rows on top of that baseline
    // hit a duplicate-key error on the shared primary keys. Cleared first
    // (children before parents, mirroring GLOBAL_REFERENCE_TABLES' own
    // insert order in reverse) so the control plane's CURRENT full state
    // — which may have grown well beyond that baseline seed — is always
    // what ends up here, with no ambiguity about which rows survived.
    for (const table of [...GLOBAL_REFERENCE_TABLES].reverse()) {
      await tenantKnex(table).del();
    }
    for (const table of GLOBAL_REFERENCE_TABLES) {
      const rows = await controlDb(table);
      if (rows.length) await tenantKnex.batchInsert(table, rows, 500);
    }

    return {
      knex: tenantKnex,
      connection: { host: BASE_CONNECTION.host, port: BASE_CONNECTION.port, database: dbName, user: BASE_CONNECTION.user, password: BASE_CONNECTION.password, ssl: false },
    };
  } catch (err) {
    if (tenantKnex) await tenantKnex.destroy().catch(() => {});
    await dropDatabase(dbName).catch(() => {});
    throw err;
  }
}

/**
 * Prepares (but does NOT run) what a shop-side local MySQL install would
 * need for this tenant — a copy of the MySQL schema plus a suggested,
 * not-yet-provisioned credentials record. Deliberately does not start a
 * new live mysqld process on this server per tenant: the real target
 * architecture is one local MySQL running on each shop's own computer,
 * not this dev machine hosting a growing pile of idle database servers
 * for a feature (offline-first sync) that doesn't exist yet — see
 * SYNC_ARCHITECTURE_NOTES.md. DLJ's own local-db/dlj/ folder (a real,
 * running instance from an earlier round) predates this convention and is
 * left as-is.
 */
function prepareLocalMySqlTemplate(tenantId) {
  const dir = path.join(__dirname, '../../local-db', tenantId.toLowerCase());
  fs.mkdirSync(dir, { recursive: true });

  const schemaSrc = path.join(__dirname, '../db/schema/mysql_local_schema.sql');
  if (fs.existsSync(schemaSrc)) {
    fs.copyFileSync(schemaSrc, path.join(dir, 'schema.sql'));
  }

  const rand = () => crypto.randomBytes(18).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
  const readme = `# ${tenantId} — local MySQL install template
# Generated ${new Date().toISOString()} — NOT YET PROVISIONED.
# No MySQL server is running for this tenant. This folder holds the
# schema and suggested credentials to use WHEN this tenant's shop-side
# computer gets its actual local MySQL install (see
# SYNC_ARCHITECTURE_NOTES.md) — nothing reads or writes to it yet.

SUGGESTED_DATABASE=${tenantId.toLowerCase()}
SUGGESTED_ROOT_PASSWORD=${rand()}
SUGGESTED_APP_USER=erp_local_user
SUGGESTED_APP_PASSWORD=${rand()}
SCHEMA_FILE=schema.sql
`;
  fs.writeFileSync(path.join(dir, 'README_NOT_PROVISIONED.md'), readme);
}

module.exports = { provisionTenantDatabase, dropDatabase, prepareLocalMySqlTemplate, GLOBAL_REFERENCE_TABLES };
