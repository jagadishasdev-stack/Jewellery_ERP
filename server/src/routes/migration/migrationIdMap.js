/**
 * Data Migration Center — batch insert + old-ID -> new-ID mapping.
 * Adapted from server/scripts/import-dlj-legacy-data.js's
 * chunkedInsertReturningIds(), simplified for this tool's single-target
 * (one Postgres DB per migration) shape — the DLJ script dual-writes to
 * a second MySQL engine too, which this tool never needs to.
 */
const db = require('../../db/knex'); // control-plane connection, for migration_id_mappings/migration_logs

// Dynamic batch-size-by-column-count math, reused verbatim from
// migrate-dlj-to-own-database.js — stays comfortably under Postgres's
// 65,535-bind-parameter-per-query limit even for a wide row.
function safeBatchSize(row, requested = 500) {
  const numColumns = Object.keys(row).length || 1;
  return Math.max(1, Math.min(requested, Math.floor(60000 / numColumns)));
}

/**
 * Inserts `rows` into `table` (on the ALS-scoped target tenant
 * connection, i.e. must be called inside runWithTenantDb) in chunks,
 * using RETURNING to get each new PK back in the same order the rows
 * were given — then records migration_id_mappings + migration_logs
 * entries for every row using `oldIdFn(row)` to recover each row's
 * original source ID (rows here are already the transformed target-
 * shape objects, not the raw staging records, so the caller passes a
 * small closure to pull the old ID back out of whatever it stashed it
 * as before insert).
 *
 * @param {import('knex').Knex} targetDb - the target tenant's own tenantDb proxy
 * @param {string} table
 * @param {string} idCol - the table's PK column name
 * @param {object[]} rows - rows to insert, WITHOUT the PK column
 * @param {object[]} meta - parallel array: { oldId, stagingId } per row
 * @param {string} migrationId
 * @param {string} entityType
 * @returns {Promise<Map<string, number>>} oldId -> newId
 */
async function batchInsertWithIdMap(targetDb, table, idCol, rows, meta, migrationId, entityType) {
  const idMap = new Map();
  if (!rows.length) return idMap;
  const chunkSize = safeBatchSize(rows[0]);

  for (let i = 0; i < rows.length; i += chunkSize) {
    const rowChunk = rows.slice(i, i + chunkSize);
    const metaChunk = meta.slice(i, i + chunkSize);
    const inserted = await targetDb(table).insert(rowChunk).returning(idCol);
    // Postgres preserves row order for a single multi-row INSERT ...
    // RETURNING — same assumption the DLJ script's own helper relies on.
    const newIds = inserted.map((r) => (typeof r === 'object' ? r[idCol] : r));

    const mapRows = [];
    const logRows = [];
    for (let j = 0; j < newIds.length; j++) {
      idMap.set(String(metaChunk[j].oldId), newIds[j]);
      mapRows.push({ Migration_ID: migrationId, Entity_Type: entityType, Old_Id: String(metaChunk[j].oldId), New_Id: newIds[j] });
      logRows.push({ Migration_ID: migrationId, Entity_Type: entityType, Source_Row: metaChunk[j].sourceRow || null, Status: 'SUCCESS', Message: `Created ${entityType} #${newIds[j]}` });
    }
    if (mapRows.length) await db('migration_id_mappings').insert(mapRows).onConflict(['Migration_ID', 'Entity_Type', 'Old_Id']).merge();
    if (logRows.length) await db('migration_logs').insert(logRows);
  }
  return idMap;
}

async function logSkipped(migrationId, entityType, sourceRow, message) {
  await db('migration_logs').insert({ Migration_ID: migrationId, Entity_Type: entityType, Source_Row: sourceRow || null, Status: 'SKIPPED', Message: message });
}

async function logError(migrationId, entityType, sourceRow, message) {
  await db('migration_logs').insert({ Migration_ID: migrationId, Entity_Type: entityType, Source_Row: sourceRow || null, Status: 'ERROR', Message: message });
}

module.exports = { safeBatchSize, batchInsertWithIdMap, logSkipped, logError };
