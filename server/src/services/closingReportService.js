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

const num = (v) => parseFloat(v || 0);
const int = (v) => parseInt(v || 0, 10);

const emptyRow = (typeName, metal) => ({
  itemType: typeName, metal,
  openingWeight: 0, openingPieces: 0,
  addPieces: 0, addWeight: 0,
  soldPieces: 0, soldWeight: 0,
  approvalIssuePieces: 0, approvalIssueWeight: 0,
  approvalReceivePieces: 0, approvalReceiveWeight: 0,
  closingWeight: 0, closingPieces: 0,
  tags: 0,
});

/**
 * Computes the full Closing Report for a tenant/date-range/metal filter.
 * Returns { rows, totals }, both shaped per column exactly as the report
 * grid expects (see client/src/pages/reports/ClosingReportPage.jsx).
 */
async function computeClosingReport({ tenantId, req, fromDate, toDate, metal = 'All' }) {
  const toDateEnd = `${toDate} 23:59:59.999`;
  const args = { tenantId, req, fromDate, toDate: toDateEnd, metal };

  const [opening, add, sold, approvalIssue, approvalReceive, tags] = await Promise.all([
    queryOpening(args),
    queryAdd(args),
    querySold(args),
    queryApprovalIssue(args),
    queryApprovalReceive(args),
    queryTags({ tenantId, req, metal }),
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

  const rows = Array.from(byKey.values()).map((row) => {
    row.closingWeight = row.openingWeight + row.addWeight + row.approvalReceiveWeight - row.soldWeight - row.approvalIssueWeight;
    row.closingPieces = row.openingPieces + row.addPieces + row.approvalReceivePieces - row.soldPieces - row.approvalIssuePieces;
    return row;
  }).sort((a, b) => a.itemType.localeCompare(b.itemType));

  const totals = rows.reduce((acc, row) => {
    Object.keys(emptyRow('', '')).forEach((k) => {
      if (k === 'itemType' || k === 'metal') return;
      acc[k] = (acc[k] || 0) + row[k];
    });
    return acc;
  }, {});

  return { fromDate, toDate, metal, rows, totals };
}

module.exports = { computeClosingReport };
