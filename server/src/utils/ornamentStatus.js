/**
 * Unified stock Status — previously scattered across separate booleans
 * (Is_Sold, Is_On_Approval, Is_On_Display, Is_Stock_Available) with no
 * single authoritative field (Missing Feature Report, Transaction Menu
 * spec). This is that field, computed consistently everywhere it's
 * shown rather than duplicated per-route.
 *
 * Honest about what the schema can actually represent: the spec also
 * names REPAIR/WORKSHOP/MELTING as possible stock statuses, but none of
 * those workflows reference a specific Ornament_ID at all —
 * tbl_repair_orders describes the customer's own item as free text (a
 * repair is never an existing stock row), and neither
 * tbl_production_transaction nor tbl_melting_refining_log carries a
 * source-ornament reference either. Fabricating those statuses here
 * would just always read "no" — this only adds a state where a real,
 * checkable signal exists: In Transfer (tbl_stock_transfer_items).
 */
const db = require('../db/tenantDb').tenantDb;

function staticStatus(row) {
  if (row.Is_Sold) return 'Sold';
  if (row.Is_On_Approval) return 'On Approval';
  if (row.Is_On_Display) return 'On Display';
  if (row.Is_Stock_Available) return 'Available';
  return 'Unavailable';
}

/**
 * Attaches a single `Status` field to each row. Batches the Transfer
 * check across every id at once (one query, not one per row) — Sold and
 * On Approval still win over "In Transfer" since those are more final,
 * authoritative states than a still-unresolved transfer.
 */
async function attachOrnamentStatus(rows, tenantId) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.Ornament_ID);
  const pending = await db('tbl_stock_transfer_items as i')
    .join('tbl_stock_transfer as t', 'i.Transfer_ID', 't.Transfer_ID')
    .where('t.Tenant_ID', tenantId)
    .where('i.Status', 'Pending')
    .whereIn('i.Ornament_ID', ids)
    .select('i.Ornament_ID');
  const inTransfer = new Set(pending.map((r) => r.Ornament_ID));

  return rows.map((r) => ({
    ...r,
    Status: (!r.Is_Sold && !r.Is_On_Approval && inTransfer.has(r.Ornament_ID)) ? 'In Transfer' : staticStatus(r),
  }));
}

module.exports = { attachOrnamentStatus, staticStatus };
