/**
 * Data Migration Center — Product/Ornament migrator. The most involved
 * of the master-data migrators: Type_ID/Design_ID/Purity_ID are foreign
 * keys into GLOBAL (no Tenant_ID) masters, so this resolves each row's
 * Type_Name/Design_Name/Purity_Text against the shared catalog and
 * upserts-by-natural-key rather than ever creating a tenant-private
 * duplicate — the same principle server/scripts/import-dlj-legacy-
 * data.js's upsertMaster() already established for exactly this reason.
 *
 * Financial fields (Wastage/Making Charge/GST/Taxable Value) are
 * deliberately NOT recomputed the way ornaments.js's live create route
 * does — that route derives them from a CURRENT gold rate + making-
 * charge policy, which doesn't exist for historical migrated stock.
 * Total_Price/Taxable_Value are set to the given Purchase_Cost (the one
 * real historical value this data actually has) rather than inventing a
 * GST/wastage breakdown nobody supplied.
 */
const { batchInsertWithIdMap, logSkipped } = require('../migrationIdMap');
const { parseKaratPurity } = require('../migrationTransform');
const { generateArticleNumber } = require('../../../utils/invoiceNumber');

async function resolveTypeId(targetDb, typeName) {
  const clean = String(typeName || '').trim();
  if (!clean) return null;
  const existing = await targetDb('tbl_item_type_master').whereRaw('LOWER("Type_Name") = LOWER(?)', [clean]).first();
  if (existing) return existing.Type_ID;
  const base = clean.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15) || 'TYPE';
  let code = base, suffix = 1;
  while (await targetDb('tbl_item_type_master').where('Type_Code', code).first()) code = `${base}${suffix++}`;
  // Category is NOT NULL with no sensible way to infer it from a bulk
  // import — 'Plain' (one of the real options this table's own admin
  // screen offers: Plain/Studded/Diamond/Antique/Silver/Custom) is the
  // least presumptuous default, editable afterward like any other master row.
  const [row] = await targetDb('tbl_item_type_master').insert({ Type_Code: code, Type_Name: clean, Category: 'Plain' }).returning('*');
  return row.Type_ID;
}

async function resolveDesignId(targetDb, designName, typeId) {
  const clean = String(designName || '').trim();
  if (!clean) return null;
  const existing = await targetDb('tbl_design_master').whereRaw('LOWER("Design_Name") = LOWER(?)', [clean]).first();
  if (existing) return existing.Design_ID;
  const base = clean.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15) || 'DESIGN';
  let code = base, suffix = 1;
  while (await targetDb('tbl_design_master').where('Design_Code', code).first()) code = `${base}${suffix++}`;
  const [row] = await targetDb('tbl_design_master').insert({ Design_Code: code, Design_Name: clean, Type_ID: typeId || null }).returning('*');
  return row.Design_ID;
}

// Matches to the NEAREST existing purity (within 1 percentage point) —
// parseKaratPurity's own math is an approximation (22K rounds to 91.7%,
// the real BIS hallmark value is 916/91.6%), so an exact-equality match
// would almost always miss the real existing row and create needless
// near-duplicates. Only creates a new global purity row when nothing is
// genuinely close.
async function resolvePurityId(targetDb, purityText) {
  const parsed = parseKaratPurity(purityText);
  if (!parsed) return null;
  const rows = await targetDb('tbl_purity_master').select('Purity_ID', 'Percentage');
  let best = null, bestDiff = Infinity;
  for (const r of rows) {
    const diff = Math.abs(parseFloat(r.Percentage) - parsed.percentage);
    if (diff < bestDiff) { bestDiff = diff; best = r; }
  }
  if (best && bestDiff <= 1.0) return best.Purity_ID;
  const base = `${Math.round(parsed.karat)}K`;
  let code = base, suffix = 1;
  while (await targetDb('tbl_purity_master').where('Purity_Code', code).first()) code = `${base}-${suffix++}`;
  const [row] = await targetDb('tbl_purity_master').insert({ Purity_Code: code, Karat: parsed.karat, Percentage: parsed.percentage }).returning('*');
  return row.Purity_ID;
}

async function migrateProducts(targetDb, tenantId, stagedRows, migrationId) {
  const toInsert = [];
  const meta = [];

  for (const row of stagedRows) {
    const mapped = row.Mapped_Data || {};
    if (row.Duplicate_Action === 'Skip') { await logSkipped(migrationId, 'product', row.Source_Row, 'Skipped per duplicate resolution.'); continue; }
    if (row.Import_Status === 'Imported') continue;
    if (row.Validation_Status === 'Error') { await logSkipped(migrationId, 'product', row.Source_Row, 'Skipped — failed validation.'); continue; }
    if (row.Duplicate_Action === 'UseExisting' && row.Duplicate_Match_Id) {
      meta.push({ oldId: row.Source_ID || row.Staging_ID, sourceRow: row.Source_Row, resolvedExisting: row.Duplicate_Match_Id });
      continue;
    }

    const typeId = await resolveTypeId(targetDb, mapped.Type_Name);
    const designId = await resolveDesignId(targetDb, mapped.Design_Name, typeId);
    const purityId = await resolvePurityId(targetDb, mapped.Purity_Text);
    const articleNumber = mapped.Article_Number || await generateArticleNumber(tenantId);
    const purchaseCost = parseFloat(mapped.Purchase_Cost || 0);

    toInsert.push({
      Tenant_ID: tenantId,
      Article_Number: articleNumber,
      Type_ID: typeId,
      Design_ID: designId,
      Purity_ID: purityId,
      Metal_Type: mapped.Metal_Type || 'Gold',
      Gross_Weight: parseFloat(mapped.Gross_Weight || 0),
      Net_Gold_Weight: parseFloat(mapped.Net_Gold_Weight || 0),
      Stone_Weight: parseFloat(mapped.Stone_Weight || 0),
      Current_Gold_Rate: parseFloat(mapped.Current_Gold_Rate || 0),
      Base_Making_Charge_Per_Gram: parseFloat(mapped.Base_Making_Charge_Per_Gram || 0),
      Purchase_Cost: purchaseCost,
      Taxable_Value: purchaseCost, // historical value — never a fabricated GST/wastage breakdown, see file header
      Total_Price: purchaseCost,
      Hallmark_Certificate_No: mapped.Hallmark_Certificate_No || null,
      Stock_Quantity: mapped.Stock_Quantity ? parseInt(mapped.Stock_Quantity) : 1,
      Is_Active: true,
      Is_Stock_Available: true,
      Data_Mode: 3,
      Created_By: 'migration',
    });
    meta.push({ oldId: row.Source_ID || row.Staging_ID, sourceRow: row.Source_Row });
  }

  const idMap = await batchInsertWithIdMap(targetDb, 'tbl_ornament_master', 'Ornament_ID', toInsert, meta.filter((m) => !m.resolvedExisting), migrationId, 'product');
  for (const m of meta) if (m.resolvedExisting) idMap.set(String(m.oldId), m.resolvedExisting);
  return idMap;
}

module.exports = { migrateProducts, resolveTypeId, resolveDesignId, resolvePurityId };
