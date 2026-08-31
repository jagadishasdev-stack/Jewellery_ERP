/**
 * Data Migration Center — Vendor/Supplier migrator. Runs inside a
 * runWithTenantDb(targetConn, ...) block (the caller's responsibility),
 * so every `targetDb(...)` call here resolves to the correct TARGET
 * tenant regardless of which physical DB it lives on.
 */
const { batchInsertWithIdMap, logSkipped } = require('../migrationIdMap');

/**
 * @param {import('knex').Knex} targetDb
 * @param {string} tenantId
 * @param {object[]} stagedRows - migration_staging_records rows for entity_type='vendor'
 * @param {string} migrationId
 * @returns {Promise<Map<string, number>>} old staging-row-derived key -> new Vendor_ID
 */
async function migrateVendors(targetDb, tenantId, stagedRows, migrationId) {
  const toInsert = [];
  const meta = [];

  const last = await targetDb('tbl_vendor_master').where('Tenant_ID', tenantId).orderBy('Vendor_ID', 'desc').first();
  let seq = (last?.Vendor_ID || 0) + 1;

  for (const row of stagedRows) {
    const mapped = row.Mapped_Data || {};
    // Duplicate resolution: Skip/UseExisting never create a new row —
    // UseExisting's target ID is the existing match itself, recorded
    // directly into the id map without an insert.
    if (row.Duplicate_Action === 'Skip') { await logSkipped(migrationId, 'vendor', row.Source_Row, 'Skipped per duplicate resolution.'); continue; }
    if (row.Import_Status === 'Imported') continue; // idempotency — a re-run of a partially-completed migration shouldn't double-insert
    if (row.Validation_Status === 'Error') { await logSkipped(migrationId, 'vendor', row.Source_Row, 'Skipped — failed validation.'); continue; }
    if (row.Duplicate_Action === 'UseExisting' && row.Duplicate_Match_Id) {
      meta.push({ oldId: row.Source_ID || row.Staging_ID, sourceRow: row.Source_Row, resolvedExisting: row.Duplicate_Match_Id });
      continue;
    }

    toInsert.push({
      Tenant_ID: tenantId,
      Vendor_Type: mapped.Vendor_Type || 'Supplier',
      Vendor_Code: `VND-${tenantId.replace('_', '')}-${String(seq++).padStart(4, '0')}`,
      Vendor_Name: mapped.Vendor_Name,
      Contact_Person: mapped.Contact_Person || null,
      Mobile_1: mapped.Mobile_1,
      Email: mapped.Email || null,
      Address_Line1: mapped.Address_Line1 || null,
      City: mapped.City || null,
      State: mapped.State || null,
      GST_No: mapped.GST_No || null,
      PAN_No: mapped.PAN_No || null,
      Opening_Balance: mapped.Opening_Balance || 0,
      Current_Balance: mapped.Opening_Balance || 0,
      Is_Active: true,
      Created_By: 'migration',
    });
    meta.push({ oldId: row.Source_ID || row.Staging_ID, sourceRow: row.Source_Row });
  }

  const idMap = await batchInsertWithIdMap(targetDb, 'tbl_vendor_master', 'Vendor_ID', toInsert, meta.filter((m) => !m.resolvedExisting), migrationId, 'vendor');
  // Fold the UseExisting rows into the same map — they resolve to a
  // pre-existing ID, not a freshly-inserted one.
  for (const m of meta) if (m.resolvedExisting) idMap.set(String(m.oldId), m.resolvedExisting);
  return idMap;
}

module.exports = { migrateVendors };
