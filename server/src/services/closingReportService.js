/**
 * Closing Report — date-range inventory reconciliation, broken down by
 * Metal Type (derived — see METAL_CASE) and Item Type:
 *   Opening Stock + Additions + Approval Receipts - Sales - Approval Issues
 *   = Closing Stock
 * plus an all-time "Number of Tags" count per item type.
 *
 * There is no daily stock snapshot table in this schema, so Opening Stock
 * for an arbitrary fromDate is reconstructed from transaction history
 * (ornament Created_Date, sale dates, approval issue/receive dates) rather
 * than read off a stored balance. See the four query builders below.
 */
const db = require('../db/knex');
const { modeVal } = require('../utils/dataModeFilter');
const { withBranch } = require('../utils/branchAccess');

// Metal is not a stored column anywhere — derive it from the item type's own
// attributes. Item types in this schema are already named/flagged distinctly
// per metal (e.g. "Ring" vs "Silver Ring" vs "Platinum Ring" vs "Diamond
// Ring" are separate tbl_item_type_master rows, confirmed against the actual
// seed data), so classifying at the item-type level — not per-ornament
// purity — is both correct and keeps every query's GROUP BY valid (grouping
// by it."Type_ID", the table's primary key, functionally determines every
// other it.* column referenced here, Postgres-legal without listing them all).
const METAL_CASE = `
  CASE
    WHEN it."Category" = 'Diamond' THEN 'Diamond'
    WHEN it."Type_Name" ILIKE '%platinum%' OR it."Type_Code" ILIKE '%plat%' THEN 'Platinum'
    WHEN it."Is_Silver" = true THEN 'Silver'
    ELSE 'Gold'
  END
`;

// Data_Mode scoping for ornament-table reads. Deliberately NOT the same as
// applyStockVisibility() in dataModeFilter.js — that helper also excludes
// rows currently Is_On_Approval, which is wrong here: an item added this
// period and later sent out on approval must still count in "Add", with its
// approval movement tracked separately in its own column. So this only
// scopes Tenant/Data_Mode/Is_Hidden, nothing about current approval state.
const applyOrnamentModeScope = (qb, req, alias) => {
  const mode = modeVal(req);
  if (mode === 2) qb.whereIn(`${alias}.Data_Mode`, [2, 3]);
  else qb.where(`${alias}.Data_Mode`, mode);
  return qb.where(`${alias}.Is_Hidden`, false);
};

const baseOrnamentJoin = (qb) => qb
  .join('tbl_item_type_master as it', 'o.Type_ID', 'it.Type_ID');

const applyMetalHaving = (qb, metal) => {
  if (metal && metal !== 'All') qb.havingRaw(`${METAL_CASE} = ?`, [metal]);
  return qb;
};

// ── 1. Opening — physically in stock the instant before fromDate ───────────
async function queryOpening({ tenantId, req, fromDate, metal }) {
  const qb = db('tbl_ornament_master as o');
  baseOrnamentJoin(qb);
  applyOrnamentModeScope(qb, req, 'o');
  withBranch(qb, req, 'o.Branch_ID');
  qb.where('o.Tenant_ID', tenantId)
    .where('o.Is_Active', true)
    .where('o.Created_Date', '<', fromDate)
    .whereNotExists(
      db('tbl_sales_details as sd')
        .join('tbl_sales_header as sh', 'sd.Sale_ID', 'sh.Sale_ID')
        .whereRaw('sd."Ornament_ID" = o."Ornament_ID"')
        .where('sh.Data_Mode', modeVal(req))
        .where('sh.Sale_Date', '<', fromDate)
    )
    .whereNotExists(
      db('tbl_approval_issue_items as aii')
        .join('tbl_approval_issue_header as aih', 'aii.Issue_ID', 'aih.Issue_ID')
        .whereRaw('aii."Ornament_ID" = o."Ornament_ID"')
        .where('aih.Data_Mode', modeVal(req))
        .where('aih.Status', '!=', 'Cancelled')
        .where('aih.Issue_Date', '<', fromDate)
        .where((b) => b.whereNull('aii.Received_Date').orWhere('aii.Received_Date', '>=', fromDate))
    )
    .groupBy('it.Type_ID')
    .select('it.Type_Name as typeName')
    .select(db.raw(`${METAL_CASE} as metal`))
    .count('o.Ornament_ID as pieces')
    .sum('o.Gross_Weight as weight');
  applyMetalHaving(qb, metal);
  return qb;
}

// ── 2. Add — new ornaments created within the period ────────────────────────
async function queryAdd({ tenantId, req, fromDate, toDate, metal }) {
  const qb = db('tbl_ornament_master as o');
  baseOrnamentJoin(qb);
  applyOrnamentModeScope(qb, req, 'o');
  withBranch(qb, req, 'o.Branch_ID');
  qb.where('o.Tenant_ID', tenantId)
    .whereBetween('o.Created_Date', [fromDate, toDate])
    .groupBy('it.Type_ID')
    .select('it.Type_Name as typeName')
    .select(db.raw(`${METAL_CASE} as metal`))
    .count('o.Ornament_ID as pieces')
    .sum('o.Gross_Weight as weight');
  applyMetalHaving(qb, metal);
  return qb;
}

// ── 3. Sold — sales within the period ───────────────────────────────────────
async function querySold({ tenantId, req, fromDate, toDate, metal }) {
  const qb = db('tbl_sales_details as sd')
    .join('tbl_sales_header as sh', 'sd.Sale_ID', 'sh.Sale_ID')
    .join('tbl_ornament_master as o', 'sd.Ornament_ID', 'o.Ornament_ID')
    .join('tbl_item_type_master as it', 'o.Type_ID', 'it.Type_ID')
    .where('sh.Tenant_ID', tenantId)
    .where('o.Tenant_ID', tenantId)
    .where('sh.Data_Mode', modeVal(req))
    .whereBetween('sh.Sale_Date', [fromDate, toDate]);
  withBranch(qb, req, 'o.Branch_ID');
  qb.groupBy('it.Type_ID')
    .select('it.Type_Name as typeName')
    .select(db.raw(`${METAL_CASE} as metal`))
    .count('sd.Detail_ID as pieces')
    .sum('sd.Gross_Weight as weight');
  applyMetalHaving(qb, metal);
  return qb;
}

// ── 4. Approval Issue — sent out on approval within the period ─────────────
async function queryApprovalIssue({ tenantId, req, fromDate, toDate, metal }) {
  const qb = db('tbl_approval_issue_items as aii')
    .join('tbl_approval_issue_header as aih', 'aii.Issue_ID', 'aih.Issue_ID')
    .join('tbl_ornament_master as o', 'aii.Ornament_ID', 'o.Ornament_ID')
    .join('tbl_item_type_master as it', 'o.Type_ID', 'it.Type_ID')
    .where('aih.Tenant_ID', tenantId)
    .where('o.Tenant_ID', tenantId)
    .where('aih.Data_Mode', modeVal(req))
    .where('aih.Status', '!=', 'Cancelled')
    .whereBetween('aih.Issue_Date', [fromDate, toDate]);
  withBranch(qb, req, 'o.Branch_ID');
  qb.groupBy('it.Type_ID')
    .select('it.Type_Name as typeName')
    .select(db.raw(`${METAL_CASE} as metal`))
    .count('aii.Issue_Item_ID as pieces')
    .sum('aii.Gross_Weight as weight');
  applyMetalHaving(qb, metal);
  return qb;
}

// ── 5. Approval Receive — received back from approval within the period ────
async function queryApprovalReceive({ tenantId, req, fromDate, toDate, metal }) {
  const qb = db('tbl_approval_issue_items as aii')
    .join('tbl_approval_issue_header as aih', 'aii.Issue_ID', 'aih.Issue_ID')
    .join('tbl_ornament_master as o', 'aii.Ornament_ID', 'o.Ornament_ID')
    .join('tbl_item_type_master as it', 'o.Type_ID', 'it.Type_ID')
    .where('aih.Tenant_ID', tenantId)
    .where('o.Tenant_ID', tenantId)
    .where('aih.Data_Mode', modeVal(req))
    .where('aii.Item_Status', 'Received')
    .whereBetween('aii.Received_Date', [fromDate, toDate]);
  withBranch(qb, req, 'o.Branch_ID');
  qb.groupBy('it.Type_ID')
    .select('it.Type_Name as typeName')
    .select(db.raw(`${METAL_CASE} as metal`))
    .count('aii.Issue_Item_ID as pieces')
    .sum('aii.Gross_Weight as weight');
  applyMetalHaving(qb, metal);
  return qb;
}

// ── 6. Tags — all-time cumulative barcode/article count per item type ──────
// Every ornament gets exactly one Article_Number ("tag") on creation, so
// this is independent of the selected date range by design (confirmed with
// the user — it's a standing "are all pieces tagged" figure, not a period one).
async function queryTags({ tenantId, req, metal }) {
  const qb = db('tbl_ornament_master as o');
  baseOrnamentJoin(qb);
  applyOrnamentModeScope(qb, req, 'o');
  withBranch(qb, req, 'o.Branch_ID');
  qb.where('o.Tenant_ID', tenantId)
    .groupBy('it.Type_ID')
    .select('it.Type_Name as typeName')
    .select(db.raw(`${METAL_CASE} as metal`))
    .count('o.Ornament_ID as tags');
  applyMetalHaving(qb, metal);
  return qb;
}

// ── 7. Sales Return — sales returned (not plain-cancelled) within the period ─
// Returned_Date distinguishes a real return from a plain /cancel (which
// leaves it null) — added specifically for this report; see
// 20260910000008_add_returned_date_to_sales.js.
async function querySalesReturn({ tenantId, req, fromDate, toDate, metal }) {
  const qb = db('tbl_sales_details as sd')
    .join('tbl_sales_header as sh', 'sd.Sale_ID', 'sh.Sale_ID')
    .join('tbl_ornament_master as o', 'sd.Ornament_ID', 'o.Ornament_ID')
    .join('tbl_item_type_master as it', 'o.Type_ID', 'it.Type_ID')
    .where('sh.Tenant_ID', tenantId)
    .where('o.Tenant_ID', tenantId)
    .where('sh.Data_Mode', modeVal(req))
    .whereNotNull('sh.Returned_Date')
    .whereBetween('sh.Returned_Date', [fromDate, toDate]);
  withBranch(qb, req, 'o.Branch_ID');
  qb.groupBy('it.Type_ID')
    .select('it.Type_Name as typeName')
    .select(db.raw(`${METAL_CASE} as metal`))
    .count('sd.Detail_ID as pieces')
    .sum('sd.Gross_Weight as weight');
  applyMetalHaving(qb, metal);
  return qb;
}

// ── 8/9. Workshop Issue/Receive — material into and finished goods out of
// production (tbl_production_transaction). Ornament_ID is nullable (a
// production run doesn't always reference an existing stock row — e.g.
// producing a brand-new piece from raw material) — those land in a
// separate "Unassigned (Raw Material)" bucket rather than being silently
// dropped from the total.
const UNASSIGNED_BUCKET = 'Unassigned (Raw Material)';
async function queryWorkshopIssue({ tenantId, req, fromDate, toDate, metal }) {
  const qb = db('tbl_production_transaction as pt')
    .leftJoin('tbl_ornament_master as o', 'pt.Ornament_ID', 'o.Ornament_ID')
    .leftJoin('tbl_item_type_master as it', 'o.Type_ID', 'it.Type_ID')
    .where('pt.Tenant_ID', tenantId)
    .whereBetween('pt.Txn_Date', [fromDate, toDate]);
  withBranch(qb, req, 'pt.Branch_ID');
  qb.groupBy('it.Type_ID')
    .select(db.raw(`COALESCE(it."Type_Name", '${UNASSIGNED_BUCKET}') as "typeName"`))
    .select(db.raw(`COALESCE(${METAL_CASE}, 'Gold') as metal`))
    .count('pt.Txn_ID as pieces')
    .sum('pt.Input_Weight as weight');
  if (metal && metal !== 'All') qb.havingRaw(`COALESCE(${METAL_CASE}, 'Gold') = ?`, [metal]);
  return qb;
}
async function queryWorkshopReceive({ tenantId, req, fromDate, toDate, metal }) {
  const qb = db('tbl_production_transaction as pt')
    .leftJoin('tbl_ornament_master as o', 'pt.Ornament_ID', 'o.Ornament_ID')
    .leftJoin('tbl_item_type_master as it', 'o.Type_ID', 'it.Type_ID')
    .where('pt.Tenant_ID', tenantId)
    .where('pt.Status', 'Completed')
    .whereBetween('pt.Txn_Date', [fromDate, toDate]);
  withBranch(qb, req, 'pt.Branch_ID');
  qb.groupBy('it.Type_ID')
    .select(db.raw(`COALESCE(it."Type_Name", '${UNASSIGNED_BUCKET}') as "typeName"`))
    .select(db.raw(`COALESCE(${METAL_CASE}, 'Gold') as metal`))
    .count('pt.Txn_ID as pieces')
    .sum('pt.Output_Weight as weight');
  if (metal && metal !== 'All') qb.havingRaw(`COALESCE(${METAL_CASE}, 'Gold') = ?`, [metal]);
  return qb;
}

// ── 10/11. Interbranch Issue/Receive — real tbl_stock_transfer rows,
// scoped to the CURRENT branch context as the sending side (Issue) or
// receiving side (Receive) respectively. Only Completed transfers count
// — a Pending one hasn't actually moved anything yet (see the Unified
// stock Status field's "In Transfer" state for those).
async function queryInterbranchIssue({ tenantId, req, fromDate, toDate, metal }) {
  const qb = db('tbl_stock_transfer_items as ti')
    .join('tbl_stock_transfer as t', 'ti.Transfer_ID', 't.Transfer_ID')
    .join('tbl_ornament_master as o', 'ti.Ornament_ID', 'o.Ornament_ID')
    .join('tbl_item_type_master as it', 'o.Type_ID', 'it.Type_ID')
    .where('t.Tenant_ID', tenantId)
    .where('t.Transfer_Type', 'Branch')
    .where('t.Status', 'Completed')
    .whereBetween('t.Transfer_Date', [fromDate, toDate]);
  withBranch(qb, req, 't.From_Branch_ID');
  qb.groupBy('it.Type_ID')
    .select('it.Type_Name as typeName')
    .select(db.raw(`${METAL_CASE} as metal`))
    .count('ti.Item_ID as pieces')
    .sum('ti.Gross_Weight as weight');
  applyMetalHaving(qb, metal);
  return qb;
}
async function queryInterbranchReceive({ tenantId, req, fromDate, toDate, metal }) {
  const qb = db('tbl_stock_transfer_items as ti')
    .join('tbl_stock_transfer as t', 'ti.Transfer_ID', 't.Transfer_ID')
    .join('tbl_ornament_master as o', 'ti.Ornament_ID', 'o.Ornament_ID')
    .join('tbl_item_type_master as it', 'o.Type_ID', 'it.Type_ID')
    .where('t.Tenant_ID', tenantId)
    .where('t.Transfer_Type', 'Branch')
    .where('t.Status', 'Completed')
    .whereBetween('t.Transfer_Date', [fromDate, toDate]);
  withBranch(qb, req, 't.To_Branch_ID');
  qb.groupBy('it.Type_ID')
    .select('it.Type_Name as typeName')
    .select(db.raw(`${METAL_CASE} as metal`))
    .count('ti.Item_ID as pieces')
    .sum('ti.Gross_Weight as weight');
  applyMetalHaving(qb, metal);
  return qb;
}

// ── 12. Melt Consumption — a tenant-wide total, NOT broken down by item
// type. tbl_melting_refining_log carries no Ornament_ID/item-type
// reference at all (a melt is a raw-metal conversion, not tied to a
// specific item type) — forcing it into the per-item-type grid would
// mean guessing, so this is a separate summary figure instead.
async function queryMeltConsumption({ tenantId, req, fromDate, toDate, metal }) {
  const qb = db('tbl_melting_refining_log as m')
    .where('m.Tenant_ID', tenantId)
    .where('m.Process_Type', 'Melting')
    .whereBetween('m.Log_Date', [fromDate, toDate]);
  if (metal && metal !== 'All') qb.where('m.Metal_Type', metal);
  return qb.select(db.raw('COUNT(*) as pieces'), db.raw('SUM("Weight_In") as weight')).first();
}

const num = (v) => parseFloat(v || 0);
const int = (v) => parseInt(v || 0, 10);

const emptyRow = (typeName, metal) => ({
  itemType: typeName, metal,
  openingWeight: 0, openingPieces: 0,
  addPieces: 0, addWeight: 0,
  soldPieces: 0, soldWeight: 0,
  approvalIssuePieces: 0, approvalIssueWeight: 0,
  approvalReceivePieces: 0, approvalReceiveWeight: 0,
  salesReturnPieces: 0, salesReturnWeight: 0,
  workshopIssuePieces: 0, workshopIssueWeight: 0,
  workshopReceivePieces: 0, workshopReceiveWeight: 0,
  interbranchIssuePieces: 0, interbranchIssueWeight: 0,
  interbranchReceivePieces: 0, interbranchReceiveWeight: 0,
  closingWeight: 0, closingPieces: 0,
  tags: 0,
});

/**
 * Computes the full Running Stock / Closing Report for a tenant/date-
 * range/metal filter. Returns { rows, totals, meltConsumption }, shaped
 * per column exactly as the report grid expects (see client/src/pages/
 * reports/ClosingReportPage.jsx). meltConsumption is a separate tenant-
 * wide figure, not part of any per-item-type row — see
 * queryMeltConsumption's own comment for why.
 *
 * Full formula (all 12 components, per the Transaction Menu spec):
 *   Opening + Add(Purchase) + Sales Return + Approval Receipt +
 *   Workshop Receipt + Interbranch Receipt
 *   - Sold - Approval Issue - Workshop Issue - Interbranch Issue
 *   = Closing
 * (Melt Consumption is tracked as its own summary figure, and Purchase
 * Return is not included — no purchase-return workflow exists anywhere
 * in this codebase yet; fabricating one here would be inventing a new
 * business process, not extending a report.)
 */
async function computeClosingReport({ tenantId, req, fromDate, toDate, metal = 'All' }) {
  const toDateEnd = `${toDate} 23:59:59.999`;
  const args = { tenantId, req, fromDate, toDate: toDateEnd, metal };

  const [
    opening, add, sold, approvalIssue, approvalReceive, tags,
    salesReturn, workshopIssue, workshopReceive, interbranchIssue, interbranchReceive, meltConsumption,
  ] = await Promise.all([
    queryOpening(args),
    queryAdd(args),
    querySold(args),
    queryApprovalIssue(args),
    queryApprovalReceive(args),
    queryTags({ tenantId, req, metal }),
    querySalesReturn(args),
    queryWorkshopIssue(args),
    queryWorkshopReceive(args),
    queryInterbranchIssue(args),
    queryInterbranchReceive(args),
    queryMeltConsumption(args),
  ]);

  const byKey = new Map();
  const keyOf = (typeName, metalVal) => `${typeName}::${metalVal}`;
  const ensure = (typeName, metalVal) => {
    const key = keyOf(typeName, metalVal);
    if (!byKey.has(key)) byKey.set(key, emptyRow(typeName, metalVal));
    return byKey.get(key);
  };

  opening.forEach((r) => { const row = ensure(r.typeName, r.metal); row.openingPieces = int(r.pieces); row.openingWeight = num(r.weight); });
  add.forEach((r) => { const row = ensure(r.typeName, r.metal); row.addPieces = int(r.pieces); row.addWeight = num(r.weight); });
  sold.forEach((r) => { const row = ensure(r.typeName, r.metal); row.soldPieces = int(r.pieces); row.soldWeight = num(r.weight); });
  approvalIssue.forEach((r) => { const row = ensure(r.typeName, r.metal); row.approvalIssuePieces = int(r.pieces); row.approvalIssueWeight = num(r.weight); });
  approvalReceive.forEach((r) => { const row = ensure(r.typeName, r.metal); row.approvalReceivePieces = int(r.pieces); row.approvalReceiveWeight = num(r.weight); });
  tags.forEach((r) => { const row = ensure(r.typeName, r.metal); row.tags = int(r.tags); });
  salesReturn.forEach((r) => { const row = ensure(r.typeName, r.metal); row.salesReturnPieces = int(r.pieces); row.salesReturnWeight = num(r.weight); });
  workshopIssue.forEach((r) => { const row = ensure(r.typeName, r.metal); row.workshopIssuePieces = int(r.pieces); row.workshopIssueWeight = num(r.weight); });
  workshopReceive.forEach((r) => { const row = ensure(r.typeName, r.metal); row.workshopReceivePieces = int(r.pieces); row.workshopReceiveWeight = num(r.weight); });
  interbranchIssue.forEach((r) => { const row = ensure(r.typeName, r.metal); row.interbranchIssuePieces = int(r.pieces); row.interbranchIssueWeight = num(r.weight); });
  interbranchReceive.forEach((r) => { const row = ensure(r.typeName, r.metal); row.interbranchReceivePieces = int(r.pieces); row.interbranchReceiveWeight = num(r.weight); });

  const rows = Array.from(byKey.values()).map((row) => {
    row.closingWeight = row.openingWeight + row.addWeight + row.salesReturnWeight + row.approvalReceiveWeight + row.workshopReceiveWeight + row.interbranchReceiveWeight
      - row.soldWeight - row.approvalIssueWeight - row.workshopIssueWeight - row.interbranchIssueWeight;
    row.closingPieces = row.openingPieces + row.addPieces + row.salesReturnPieces + row.approvalReceivePieces + row.workshopReceivePieces + row.interbranchReceivePieces
      - row.soldPieces - row.approvalIssuePieces - row.workshopIssuePieces - row.interbranchIssuePieces;
    return row;
  }).sort((a, b) => a.itemType.localeCompare(b.itemType));

  const totals = rows.reduce((acc, row) => {
    Object.keys(emptyRow('', '')).forEach((k) => {
      if (k === 'itemType' || k === 'metal') return;
      acc[k] = (acc[k] || 0) + row[k];
    });
    return acc;
  }, {});

  return {
    fromDate, toDate, metal, rows, totals,
    meltConsumption: { pieces: int(meltConsumption?.pieces), weight: num(meltConsumption?.weight) },
  };
}

module.exports = { computeClosingReport };
