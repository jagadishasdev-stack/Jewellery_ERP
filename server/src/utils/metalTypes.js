/**
 * Single source of truth for the metal-type classification every stock item
 * carries (tbl_ornament_master.Metal_Type, tbl_purity_master.Metal_Type) —
 * used for validation on write and for filter dropdowns/report grouping on
 * read. Backed by tbl_metal_type_master (a real, admin-editable master —
 * see routes/master.js's /metal-types CRUD) rather than a hardcoded array,
 * so a custom metal type an admin adds there is immediately valid
 * everywhere that uses these helpers — no code change needed per metal
 * type. This table is global (no Tenant_ID), same as tbl_purity_master.
 *
 * "Diamond" here means loose/predominantly-diamond stock (no gold-purity
 * concept applies) — a diamond-STUDDED gold ring is still Metal_Type
 * 'Gold' with its stones tracked via Stone_ID/Total_Stone_Carat as before;
 * this only changes for stock whose OWN base material is the diamond.
 */
const db = require('../db/knex');

// Plain arrays for callers that build a dropdown/enum message from the
// full list (e.g. excelImport.js's case-insensitive lookup, or an error
// message listing valid values) rather than validating one value.
async function getMetalTypes() {
  const rows = await db('tbl_metal_type_master').where({ Is_Active: true }).orderBy('Metal_Name');
  return rows.map((r) => r.Metal_Name);
}

async function getMetalTypesWithPurity() {
  const rows = await db('tbl_metal_type_master').where({ Is_Active: true, Has_Purity: true }).orderBy('Metal_Name');
  return rows.map((r) => r.Metal_Name);
}

async function isValidMetalType(value) {
  if (!value) return false;
  const row = await db('tbl_metal_type_master').where({ Metal_Name: value, Is_Active: true }).first();
  return !!row;
}

async function isValidMetalTypeWithPurity(value) {
  if (!value) return false;
  const row = await db('tbl_metal_type_master').where({ Metal_Name: value, Is_Active: true, Has_Purity: true }).first();
  return !!row;
}

/**
 * Best-effort inference for flows that only ever had a free-text Purity
 * field and no real Metal_Type (the four tbl_bin_* tables) — same
 * SIL-prefix/PLAT-prefix/else-Gold heuristic the migration used to
 * backfill tbl_ornament_master/tbl_purity_master. An explicit override
 * always wins; this is only the last-resort guess. Intentionally NOT
 * DB-driven — this is a fixed, narrow heuristic over known legacy prefix
 * conventions, not a lookup against the configurable metal type list.
 */
function inferMetalTypeFromPurityText(text) {
  const t = String(text || '').trim().toUpperCase();
  if (t.startsWith('SIL')) return 'Silver';
  if (t.startsWith('PLAT')) return 'Platinum';
  return 'Gold';
}

module.exports = {
  getMetalTypes, getMetalTypesWithPurity,
  isValidMetalType, isValidMetalTypeWithPurity,
  inferMetalTypeFromPurityText,
};
