/**
 * Data Migration Center — Customer migrator. Runs inside a
 * runWithTenantDb(targetConn, ...) block (the caller's responsibility).
 * Customer_Code generation replicates customers.js's own
 * generateCustomerCode() (not exported for reuse) — same format, same
 * per-(tenant,Data_Mode) sequence — migrated customers land in Official
 * mode (Data_Mode=3), the correct default for real historical business
 * data, not a demo/practice import.
 */
const { batchInsertWithIdMap, logSkipped } = require('../migrationIdMap');

async function migrateCustomers(targetDb, tenantId, stagedRows, migrationId) {
  const toInsert = [];
  const meta = [];

  const countRow = await targetDb('tbl_customer_master').where({ Tenant_ID: tenantId, Data_Mode: 3 }).count('Customer_ID as c').first();
  let seq = parseInt(countRow.c) + 1;

  for (const row of stagedRows) {
    const mapped = row.Mapped_Data || {};
    if (row.Duplicate_Action === 'Skip') { await logSkipped(migrationId, 'customer', row.Source_Row, 'Skipped per duplicate resolution.'); continue; }
    if (row.Import_Status === 'Imported') continue;
    if (row.Validation_Status === 'Error') { await logSkipped(migrationId, 'customer', row.Source_Row, 'Skipped — failed validation.'); continue; }
    if (row.Duplicate_Action === 'UseExisting' && row.Duplicate_Match_Id) {
      meta.push({ oldId: row.Source_ID || row.Staging_ID, sourceRow: row.Source_Row, resolvedExisting: row.Duplicate_Match_Id });
      continue;
    }

    toInsert.push({
      Tenant_ID: tenantId,
      Customer_Code: `CUST-${tenantId.replace('_', '')}-${String(seq++).padStart(5, '0')}`,
      Customer_Name: mapped.Customer_Name,
      Mobile_1: mapped.Mobile_1,
      Mobile_2: mapped.Mobile_2 || null,
      Email: mapped.Email || null,
      Date_Of_Birth: mapped.Date_Of_Birth || null,
      Anniversary_Date: mapped.Anniversary_Date || null,
      Address_Line1: mapped.Address_Line1 || null,
      Address_Line2: mapped.Address_Line2 || null,
      City: mapped.City || null,
      State: mapped.State || null,
      Pincode: mapped.Pincode || null,
      GST_No: mapped.GST_No || null,
      PAN_No: mapped.PAN_No || null,
      Data_Mode: 3,
      Is_Active: true,
      Created_By: 'migration',
    });
    meta.push({ oldId: row.Source_ID || row.Staging_ID, sourceRow: row.Source_Row });
  }

  const idMap = await batchInsertWithIdMap(targetDb, 'tbl_customer_master', 'Customer_ID', toInsert, meta.filter((m) => !m.resolvedExisting), migrationId, 'customer');
  for (const m of meta) if (m.resolvedExisting) idMap.set(String(m.oldId), m.resolvedExisting);
  return idMap;
}

module.exports = { migrateCustomers };
