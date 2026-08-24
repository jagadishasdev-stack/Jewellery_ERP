/**
 * Database-per-tenant migration, Phase 1.
 *
 * `tenantDb` is a drop-in replacement for the old shared `db` export from
 * `./knex` — route files that only ever touch tenant-owned tables (the vast
 * majority) just change their import to this file and nothing else, because
 * every `db('table')`, `db.raw(...)`, `db.transaction(...)` call keeps
 * working exactly as before. What changes is which physical database those
 * calls actually hit: `authenticate` (see ../middleware/auth.js) resolves
 * the current request's tenant connection and runs the rest of the request
 * inside `runWithTenantDb(...)`, so `tenantDb` always forwards to whichever
 * tenant is making the current request.
 *
 * Files that need the shared control-plane tables (tbl_tenant_master,
 * tbl_role_master, tbl_purity_master, tbl_item_type_master, tbl_design_master,
 * tbl_gemstone_master, tbl_erp_modules, global tbl_invoice_template_master
 * rows, tbl_user_directory) keep using `require('../db/knex')` directly —
 * that connection is unaffected by any of this.
 */
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

function runWithTenantDb(knexInstance, callback) {
  return als.run({ db: knexInstance }, callback);
}

function currentTenantDb() {
  const store = als.getStore();
  if (!store?.db) {
    throw new Error(
      'No tenant database context is active for this request — ' +
      'authenticate() must run before any tenantDb query.'
    );
  }
  return store.db;
}

// A Proxy around a no-op function so `tenantDb(...)` (the knex call form),
// property access (`tenantDb.raw`, `tenantDb.transaction`, ...), and method
// calls all forward to whatever the real per-request knex instance is.
const tenantDb = new Proxy(function () {}, {
  apply(_target, _thisArg, args) {
    return currentTenantDb()(...args);
  },
  get(_target, prop) {
    const real = currentTenantDb();
    const value = real[prop];
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

module.exports = { tenantDb, runWithTenantDb };
