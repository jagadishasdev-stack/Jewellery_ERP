/**
 * Data Migration Center — reconciliation (design doc §51-52). Compares
 * what was staged (the "old ERP" side, as far as this tool ever saw it)
 * against what actually landed in the real target tenant tables — using
 * migration_id_mappings as the authoritative "these are the rows THIS
 * migration created" list, not a live table count (which would also
 * include everything that existed before the migration ran).
 */
const db = require('../../db/knex');

async function buildReconciliation(migrationId) {
  const migration = await db('migrations').where('Migration_ID', migrationId).first();
  if (!migration) return null;

  const stagedCounts = await db('migration_staging_records')
    .where('Migration_ID', migrationId).select('Entity_Type').count('* as c').groupBy('Entity_Type');
  const importedCounts = await db('migration_id_mappings')
    .where('Migration_ID', migrationId).select('Entity_Type').countDistinct('New_Id as c').groupBy('Entity_Type');

  const stagedByEntity = Object.fromEntries(stagedCounts.map((r) => [r.Entity_Type, parseInt(r.c)]));
  const importedByEntity = Object.fromEntries(importedCounts.map((r) => [r.Entity_Type, parseInt(r.c)]));

  const entityTypes = [...new Set([...Object.keys(stagedByEntity), ...Object.keys(importedByEntity)])];
  const rows = entityTypes.map((entityType) => {
    const staged = stagedByEntity[entityType] || 0;
    const imported = importedByEntity[entityType] || 0;
    return { entityType, staged, imported, difference: staged - imported };
  });

  return { migrationId, tenantId: migration.Tenant_ID, status: migration.Status, rows };
}

module.exports = { buildReconciliation };
