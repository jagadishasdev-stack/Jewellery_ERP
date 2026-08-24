/**
 * Database-per-tenant migration, Phase 1.
 *
 * Every database — the control-plane DB and every tenant's own DB — runs
 * the exact same migration set from ./migrations. This is deliberately NOT
 * split into "control" vs "tenant" migration directories: a tenant database
 * ends up with harmless, unused empty copies of the control-plane tables
 * (tbl_tenant_master, tbl_role_master, etc.) alongside its real tenant-owned
 * tables. That's simpler and safer than hand-splitting 25+ existing
 * migration files by table, and costs nothing at runtime since only
 * `require('../db/knex')` (the control-plane connection) ever queries those
 * tables — tenant connections never touch them.
 *
 * Used by tenant provisioning (Phase 3) and the existing-tenant data
 * migration script (Phase 4) to bring a brand-new tenant database up to the
 * current schema.
 */
const knex = require('knex');
const path = require('path');

async function runMigrationsAgainst(connection) {
  const tempKnex = knex({
    client: 'pg',
    connection,
    migrations: {
      directory: path.join(__dirname, 'migrations'),
      tableName: 'knex_migrations',
    },
  });
  try {
    await tempKnex.migrate.latest();
  } finally {
    await tempKnex.destroy();
  }
}

module.exports = { runMigrationsAgainst };
