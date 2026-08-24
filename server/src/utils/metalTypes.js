/**
 * Single source of truth for the metal-type classification every stock item
 * now carries (tbl_ornament_master.Metal_Type, tbl_purity_master.Metal_Type)
 * — used for validation on write and for filter dropdowns/report grouping
 * on read. Kept here rather than re-spelled per-route, the same lesson
 * learned from PAYMENT_LEDGER drifting across sales.js/purchase.js earlier.
 *
 * "Diamond" here means loose/predominantly-diamond stock (no gold-purity
 * concept applies) — a diamond-STUDDED gold ring is still Metal_Type
 * 'Gold' with its stones tracked via Stone_ID/Total_Stone_Carat as before;
 * this only changes for stock whose OWN base material is the diamond.
 */
const METAL_TYPES = ['Gold', 'Silver', 'Platinum', 'Diamond'];

// Purity (karat/fineness) only makes sense for actual metal — a diamond
// parcel has a clarity/color grade, not a purity percentage.
const METAL_TYPES_WITH_PURITY = ['Gold', 'Silver', 'Platinum'];

/**
 * Best-effort inference for flows that only ever had a free-text Purity
 * field and no real Metal_Type (the four tbl_bin_* tables) — same
 * SIL-prefix/PLAT-prefix/else-Gold heuristic the migration used to
 * backfill tbl_ornament_master/tbl_purity_master. An explicit override
 * always wins; this is only the last-resort guess.
 */
function inferMetalTypeFromPurityText(text) {
  const t = String(text || '').trim().toUpperCase();
  if (t.startsWith('SIL')) return 'Silver';
  if (t.startsWith('PLAT')) return 'Platinum';
  return 'Gold';
}

module.exports = { METAL_TYPES, METAL_TYPES_WITH_PURITY, inferMetalTypeFromPurityText };
