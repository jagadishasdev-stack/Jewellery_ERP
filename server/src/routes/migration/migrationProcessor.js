/**
 * Data Migration Center — the processor. Orchestrates all 6 entity
 * migrators in real FK order inside ONE runWithTenantDb(targetConn, ...)
 * block, updates migrations.Success/Warning/Error_Records as it goes,
 * and pushes a live progress event over the already-working Socket.IO
 * /display namespace (same tenant-room pattern goldRate.js/sales.js
 * already use) — with the actual numbers in the payload, a deliberate
 * departure from that namespace's usual "nudge only, refetch over REST"
 * convention, since an admin watching a progress bar needs the number,
 * not a refetch.
 *
 * No queue/worker infrastructure — kicked off as a plain async function
 * the route doesn't await (see migrationRoutes.js's /start), tracked via
 * this same migrations row. See the plan's own #5 for the trade-off
 * being accepted (a server restart mid-run loses in-flight progress,
 * acceptable for an admin-triggered, supervised operation).
 */
const db = require('../../db/knex');
const { getTenantDb } = require('../../db/tenantDbResolver');
const { runWithTenantDb } = require('../../db/tenantDb');
const { migrateVendors } = require('./migrationEntities/vendorMigrator');
const { migrateCustomers } = require('./migrationEntities/customerMigrator');
const { migrateProducts } = require('./migrationEntities/productMigrator');
const { migratePurchases } = require('./migrationEntities/purchaseMigrator');
const { migrateSales } = require('./migrationEntities/saleMigrator');
const { migratePayments } = require('./migrationEntities/paymentMigrator');

// Real FK order: masters before anything that references them, Products
// (needs nothing from the others) before Purchases/Sales (which resolve
// Vendor/Customer by name), Payments last (resolves against an already-
// migrated-or-existing Sale/Purchase).
const ENTITY_ORDER = ['vendor', 'customer', 'product', 'purchase', 'sale', 'payment'];
const ID_MAP_MIGRATORS = { vendor: migrateVendors, customer: migrateCustomers, product: migrateProducts, purchase: migratePurchases, sale: migrateSales };

async function markStagingResults(entityType, rows, idMap) {
  for (const row of rows) {
    if (row.Import_Status === 'Imported') continue; // a prior partial run already finished this one
    const key = String(row.Source_ID || row.Staging_ID);
    if (row.Validation_Status === 'Error' || row.Duplicate_Action === 'Skip') {
      await db('migration_staging_records').where('Staging_ID', row.Staging_ID).update({ Import_Status: 'Skipped' });
    } else if (idMap && idMap.has(key)) {
      await db('migration_staging_records').where('Staging_ID', row.Staging_ID).update({ Import_Status: 'Imported', Target_Id: idMap.get(key) });
    } else {
      await db('migration_staging_records').where('Staging_ID', row.Staging_ID).update({ Import_Status: 'Failed', Import_Error: 'Not processed — see migration_logs for the reason.' });
    }
  }
}

// Payments have no per-row idMap (they mutate an existing Sale/Purchase,
// not create a new keyed record) — approximated from Validation_Status/
// Duplicate_Action alone; migration_logs still carries the authoritative
// per-row reason for anything genuinely unmatched.
async function markPaymentStagingResults(rows) {
  for (const row of rows) {
    if (row.Import_Status === 'Imported') continue;
    const status = (row.Validation_Status === 'Error' || row.Duplicate_Action === 'Skip') ? 'Skipped' : 'Imported';
    await db('migration_staging_records').where('Staging_ID', row.Staging_ID).update({ Import_Status: status });
  }
}

function emitProgress(io, tenantId, payload) {
  if (!io) return;
  try { io.of('/display').to(`tenant-${tenantId}`).emit('migration-progress', payload); } catch (_e) { /* progress push is best-effort, never fatal to the migration itself */ }
}

/**
 * Runs a migration end to end. Not awaited by the route that calls it —
 * see migrationRoutes.js POST /:id/start.
 * @param {string} migrationId
 * @param {import('socket.io').Server|null} io
 */
async function runMigration(migrationId, io) {
  const migration = await db('migrations').where('Migration_ID', migrationId).first();
  if (!migration) return;

  try {
    const targetConn = await getTenantDb(migration.Tenant_ID);
    let success = 0, warning = 0, error = 0;

    await runWithTenantDb(targetConn, async () => {
      for (const entityType of ENTITY_ORDER) {
        const rows = await db('migration_staging_records').where({ Migration_ID: migrationId, Entity_Type: entityType });
        if (!rows.length) continue;

        try {
          if (entityType === 'payment') {
            await migratePayments(targetConn, migration.Tenant_ID, rows, migrationId);
            await markPaymentStagingResults(rows);
          } else {
            const idMap = await ID_MAP_MIGRATORS[entityType](targetConn, migration.Tenant_ID, rows, migrationId);
            await markStagingResults(entityType, rows, idMap);
          }
        } catch (entityErr) {
          // One entity type failing outright (a genuine bug, a DB issue)
          // doesn't abort the whole migration — the remaining entity
          // types still get a chance, and this one is fully visible in
          // the report rather than leaving everything half-finished.
          await db('migration_logs').insert({ Migration_ID: migrationId, Entity_Type: entityType, Status: 'ERROR', Message: `${entityType} migration failed entirely: ${entityErr.message}` });
          await db('migration_staging_records').where({ Migration_ID: migrationId, Entity_Type: entityType }).whereNot('Import_Status', 'Imported').update({ Import_Status: 'Failed', Import_Error: entityErr.message });
        }

        const counts = await db('migration_staging_records').where({ Migration_ID: migrationId, Entity_Type: entityType })
          .select('Import_Status').count('* as c').groupBy('Import_Status');
        const byStatus = Object.fromEntries(counts.map((c) => [c.Import_Status, parseInt(c.c)]));
        success += byStatus.Imported || 0;
        error += (byStatus.Failed || 0);
        warning += (byStatus.Skipped || 0);

        await db('migrations').where('Migration_ID', migrationId).update({ Success_Records: success, Warning_Records: warning, Error_Records: error });
        emitProgress(io, migration.Tenant_ID, { migrationId, entityType, done: ENTITY_ORDER.indexOf(entityType) + 1, totalEntities: ENTITY_ORDER.length, success, warning, error });
      }
    });

    await db('migrations').where('Migration_ID', migrationId).update({ Status: 'COMPLETED', Completed_Date: new Date() });
    emitProgress(io, migration.Tenant_ID, { migrationId, status: 'COMPLETED', success, warning, error });
  } catch (err) {
    await db('migrations').where('Migration_ID', migrationId).update({ Status: 'FAILED', Failure_Reason: err.message });
    emitProgress(io, migration.Tenant_ID, { migrationId, status: 'FAILED', error: err.message });
  }
}

module.exports = { runMigration, ENTITY_ORDER };
