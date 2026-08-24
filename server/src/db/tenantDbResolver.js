/**
 * Database-per-tenant migration, Phase 1.
 *
 * getTenantDb(tenantId) resolves a request's Tenant_ID to the actual knex
 * instance that should serve it, reading connection details off that
 * tenant's tbl_tenant_master row (control-plane DB).
 *
 * A tenant with no DB_Host set has not been migrated to its own database
 * yet — this includes SA_MASTER (the platform operator, which never gets
 * one; its own data lives directly in the control-plane DB) and any
 * not-yet-migrated tenant during the Phase 4 rollout. Both cases fall back
 * to the existing shared control-plane connection, so nothing breaks until
 * a tenant is actually migrated.
 *
 * Real per-tenant connections are cached (creating a knex pool is
 * expensive), with a simple LRU cap so the number of concurrently-open
 * pools doesn't grow unbounded as tenants are added.
 */
const knex = require('knex');
const controlDb = require('./knex');

const MAX_CACHED_CONNECTIONS = 30;
const cache = new Map(); // Tenant_ID -> knex instance, insertion order = LRU order

async function getTenantDb(tenantId) {
  if (cache.has(tenantId)) {
    const instance = cache.get(tenantId);
    // Move to the end so it's treated as most-recently-used.
    cache.delete(tenantId);
    cache.set(tenantId, instance);
    return instance;
  }

  const tenant = await controlDb('tbl_tenant_master').where('Tenant_ID', tenantId).first();
  if (!tenant) {
    throw new Error(`Unknown Tenant_ID: ${tenantId}`);
  }

  // Not yet on its own database — use the control-plane connection.
  if (!tenant.DB_Host) {
    return controlDb;
  }

  const instance = knex({
    client: 'pg',
    connection: {
      host: tenant.DB_Host,
      port: tenant.DB_Port || 5432,
      database: tenant.DB_Name,
      user: tenant.DB_User,
      password: tenant.DB_Password,
      ssl: tenant.DB_SSL ? { rejectUnauthorized: false } : false,
    },
    pool: { min: 1, max: 10 },
  });

  if (cache.size >= MAX_CACHED_CONNECTIONS) {
    const oldestTenantId = cache.keys().next().value;
    const oldestInstance = cache.get(oldestTenantId);
    cache.delete(oldestTenantId);
    oldestInstance.destroy().catch(() => {});
  }
  cache.set(tenantId, instance);

  return instance;
}

module.exports = { getTenantDb };
