const router = require('express').Router();
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { modeVal, applyStockVisibility, excludeHiddenStockSales } = require('../utils/dataModeFilter');
const { computeClosingReport } = require('../services/closingReportService');
const { getAllowedBranches, requireValidBranch, withBranch } = require('../utils/branchAccess');
const { generateClosingReportPDF } = require('../services/pdfService');
const dayjs = require('dayjs');

// ─── GET /api/reports/sales-summary ───────────────────────────────────────────
router.get('/sales-summary', authenticate, async (req, res) => {
  const { fromDate, toDate, branchId } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'fromDate and toDate required.');

  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);

    let qb = excludeHiddenStockSales(db('tbl_sales_header')
      .where('Tenant_ID', tenantId)
      .where('Data_Mode', dm)
      .whereRaw(`DATE("Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .whereNot('Payment_Status', 'Cancelled'), req);

    if (branchId) qb = qb.where('Branch_ID', branchId);

    const summary = await qb.select(
      db.raw('COUNT(*) as total_bills'),
      db.raw('SUM("Net_Payable_Amount") as total_revenue'),
      db.raw('SUM("Amount_Paid") as total_collected'),
      db.raw('SUM("Balance_Amount") as total_pending'),
      db.raw('SUM("Discount_Amount") as total_discount'),
      db.raw('SUM("GST_Amount") as total_gst'),
      db.raw('SUM("Total_Gross_Weight") as total_weight'),
      db.raw('SUM("Old_Gold_Exchange_Amount") as total_old_gold')
    ).first();

    const byPaymentMode = await excludeHiddenStockSales(db('tbl_sales_payments as sp')
      .join('tbl_sales_header as sh', 'sp.Sale_ID', 'sh.Sale_ID')
      .where('sh.Tenant_ID', tenantId)
      .where('sh.Data_Mode', dm)
      .whereRaw(`DATE("sh"."Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .whereNot('sh.Payment_Status', 'Cancelled'), req, 'sh')
      .groupBy('sp.Payment_Mode')
      .select('sp.Payment_Mode', db.raw('COUNT(DISTINCT "sp"."Sale_ID") as count'), db.raw('SUM("sp"."Amount") as amount'))
      .orderBy('amount', 'desc');

    const bySaleType = await excludeHiddenStockSales(db('tbl_sales_header')
      .where('Tenant_ID', tenantId).where('Data_Mode', dm)
      .whereRaw(`DATE("Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .whereNot('Payment_Status', 'Cancelled'), req)
      .groupBy('Sale_Type')
      .select('Sale_Type', db.raw('COUNT(*) as count'), db.raw('SUM("Net_Payable_Amount") as amount'));

    const dailyBreakdown = await excludeHiddenStockSales(db('tbl_sales_header')
      .where('Tenant_ID', tenantId).where('Data_Mode', dm)
      .whereRaw(`DATE("Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .whereNot('Payment_Status', 'Cancelled'), req)
      .groupByRaw(`DATE("Sale_Date")`)
      .select(db.raw(`DATE("Sale_Date") as date`), db.raw('COUNT(*) as bills'), db.raw('SUM("Net_Payable_Amount") as revenue'), db.raw('SUM("GST_Amount") as gst'))
      .orderBy('date');

    return sendSuccess(res, { summary, byPaymentMode, bySaleType, dailyBreakdown });
  } catch (err) {
    console.error('Sales summary error:', err);
    return sendError(res, 500, 'Failed to generate report.');
  }
});

// ─── GET /api/reports/sales-by-metal ───────────────────────────────────────────
// Metal-type segmentation existed only on the STOCK side (inventory-value's
// byMetal) — once something actually sold, there was no way to see "how
// much Gold vs Silver vs Platinum vs Diamond did we sell this month."
// Joins each sale line back to its ornament for Metal_Type; a line with no
// Ornament_ID (a manual/adjustment line) or an ornament since deleted
// falls under 'Unknown' rather than being silently dropped.
router.get('/sales-by-metal', authenticate, async (req, res) => {
  const { fromDate, toDate } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'fromDate and toDate required.');
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);

    const byMetal = await excludeHiddenStockSales(db('tbl_sales_details as sd')
      .join('tbl_sales_header as sh', 'sd.Sale_ID', 'sh.Sale_ID')
      .leftJoin('tbl_ornament_master as o', 'sd.Ornament_ID', 'o.Ornament_ID')
      .where('sh.Tenant_ID', tenantId).where('sh.Data_Mode', dm)
      .whereRaw('DATE("sh"."Sale_Date") BETWEEN ? AND ?', [fromDate, toDate])
      .whereNot('sh.Payment_Status', 'Cancelled'), req, 'sh')
      .groupBy(db.raw(`COALESCE("o"."Metal_Type", 'Unknown')`))
      .select(
        db.raw(`COALESCE("o"."Metal_Type", 'Unknown') as "Metal_Type"`),
        db.raw('COUNT(*) as pieces_sold'),
        db.raw('SUM("sd"."Gross_Weight") as total_weight'),
        db.raw('SUM("sd"."Total_Line_Price") as total_revenue')
      )
      .orderBy('total_revenue', 'desc');

    const [overall] = await excludeHiddenStockSales(db('tbl_sales_details as sd')
      .join('tbl_sales_header as sh', 'sd.Sale_ID', 'sh.Sale_ID')
      .where('sh.Tenant_ID', tenantId).where('sh.Data_Mode', dm)
      .whereRaw('DATE("sh"."Sale_Date") BETWEEN ? AND ?', [fromDate, toDate])
      .whereNot('sh.Payment_Status', 'Cancelled'), req, 'sh')
      .select(db.raw('COUNT(*) as pieces_sold'), db.raw('SUM("sd"."Gross_Weight") as total_weight'), db.raw('SUM("sd"."Total_Line_Price") as total_revenue'));

    return sendSuccess(res, { fromDate, toDate, overall, byMetal });
  } catch (err) { console.error('Sales-by-metal error:', err.message); return sendError(res, 500, 'Failed to generate sales-by-metal report.'); }
});

// ─── GET /api/reports/inventory-value ─────────────────────────────────────────
// ?metalType=Gold|Silver|Platinum|Diamond gives an ISOLATED report scoped to
// just that metal — overall totals AND the item-type breakdown both narrow
// to it, so a tenant can pull "just my Gold stock" (or Silver/Platinum/
// Diamond) as its own report. byMetal is always returned unfiltered
// (regardless of ?metalType) so the segmented totals across all four are
// visible at a glance even while drilled into one.
router.get('/inventory-value', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { metalType } = req.query;

    let byTypeQb = db('tbl_ornament_master as o')
      .join('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .where('o.Tenant_ID', tenantId)
      .where('o.Is_Active', true)
      .where('o.Is_Sold', false)
      .groupBy('t.Type_Name', 't.Type_Code')
      .select('t.Type_Name', 't.Type_Code', db.raw('COUNT(*) as count'), db.raw('SUM("Gross_Weight") as total_weight'), db.raw('SUM("Total_Price") as total_mrp'), db.raw('SUM("Purchase_Cost") as total_cost'))
      .orderBy('total_mrp', 'desc');
    if (metalType) byTypeQb = byTypeQb.where('o.Metal_Type', metalType);
    const byType = await applyStockVisibility(byTypeQb, req, 'o');

    let byMetalQb = db('tbl_ornament_master as o')
      .where('o.Tenant_ID', tenantId).where('o.Is_Active', true).where('o.Is_Sold', false)
      .groupBy('o.Metal_Type')
      .select('o.Metal_Type', db.raw('COUNT(*) as count'), db.raw('SUM("Gross_Weight") as total_weight'), db.raw('SUM("Total_Price") as total_mrp'), db.raw('SUM("Purchase_Cost") as total_cost'))
      .orderBy('total_mrp', 'desc');
    const byMetal = await applyStockVisibility(byMetalQb, req, 'o');

    let overallQb = db('tbl_ornament_master')
      .where('Tenant_ID', tenantId).where('Is_Active', true).where('Is_Sold', false)
      .select(db.raw('COUNT(*) as total_pieces'), db.raw('SUM("Gross_Weight") as total_weight'), db.raw('SUM("Total_Price") as total_mrp'), db.raw('SUM("Purchase_Cost") as total_cost'));
    if (metalType) overallQb = overallQb.where('Metal_Type', metalType);
    const overall = await applyStockVisibility(overallQb, req).first();

    return sendSuccess(res, { overall, byType, byMetal });
  } catch (err) {
    return sendError(res, 500, 'Failed to generate inventory report.');
  }
});

// ─── GET /api/reports/karigar-summary ─────────────────────────────────────────
router.get('/karigar-summary', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    const summary = await db('tbl_issue_to_karigar as i')
      .join('tbl_vendor_master as v', 'i.Karigar_ID', 'v.Vendor_ID')
      .where('i.Tenant_ID', tenantId)
      .where('i.Data_Mode', dm)
      .groupBy('v.Vendor_Name', 'v.Vendor_Code', 'i.Status')
      .select('v.Vendor_Name', 'v.Vendor_Code', 'i.Status', db.raw('COUNT(*) as issues'), db.raw('SUM("Gold_Weight_Issued") as total_issued'), db.raw('SUM("Returned_Weight") as total_returned'), db.raw('SUM("Gold_Weight_Issued" - "Returned_Weight") as pending_weight'))
      .orderBy('v.Vendor_Name');
    return sendSuccess(res, summary);
  } catch (err) {
    return sendError(res, 500, 'Failed to generate karigar report.');
  }
});

// ─── GET /api/reports/customer-ledger/:id ─────────────────────────────────────
router.get('/customer-ledger/:id', authenticate, async (req, res) => {
  try {
    const dm = modeVal(req);
    const sales = await excludeHiddenStockSales(db('tbl_sales_header as s')
      .leftJoin('tbl_sales_details as d', 's.Sale_ID', 'd.Sale_ID')
      .where('s.Customer_ID', req.params.id)
      .where('s.Tenant_ID', req.user.tenantId)
      .where('s.Data_Mode', dm), req, 's')
      .orderBy('s.Sale_Date', 'desc')
      .select('s.Sale_ID', 's.Invoice_Number', 's.Sale_Date', 's.Net_Payable_Amount', 's.Amount_Paid', 's.Balance_Amount', 's.Payment_Mode', 's.Payment_Status', db.raw('COUNT(d."Detail_ID") as item_count'), db.raw('SUM(d."Gross_Weight") as total_weight'))
      .groupBy('s.Sale_ID', 's.Invoice_Number', 's.Sale_Date', 's.Net_Payable_Amount', 's.Amount_Paid', 's.Balance_Amount', 's.Payment_Mode', 's.Payment_Status');
    const totals = {
      total_purchases: sales.length,
      total_value:   sales.reduce((s, r) => s + parseFloat(r.Net_Payable_Amount || 0), 0),
      total_paid:    sales.reduce((s, r) => s + parseFloat(r.Amount_Paid || 0), 0),
      total_pending: sales.reduce((s, r) => s + parseFloat(r.Balance_Amount || 0), 0),
    };
    return sendSuccess(res, { sales, totals });
  } catch (err) {
    return sendError(res, 500, 'Failed to generate customer ledger.');
  }
});

// ─── GET /api/reports/counter-summary ────────────────────────────────────────
router.get('/counter-summary', authenticate, async (req, res) => {
  const { fromDate, toDate } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'Date range required.');
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    const counterStats = await excludeHiddenStockSales(db('tbl_sales_header')
      .where('Tenant_ID', tenantId).where('Data_Mode', dm)
      .whereRaw(`DATE("Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .whereNot('Payment_Status', 'Cancelled'), req)
      .groupByRaw('"Counter_ID", "Counter_Name", "Operator_Name"')
      .select(
        db.raw('COALESCE("Counter_Name", \'Walk-in\') AS counter'),
        db.raw('COALESCE("Operator_Name", \'Unknown\') AS operator'),
        db.raw('COUNT(*) AS total_bills'),
        db.raw('SUM("Net_Payable_Amount") AS total_revenue'),
        db.raw('SUM("Amount_Paid") AS total_collected'),
        db.raw('SUM("GST_Amount") AS total_gst'),
        db.raw('SUM("Discount_Amount") AS total_discount'),
        db.raw('SUM("Total_Gross_Weight") AS total_weight'),
        db.raw('COUNT(CASE WHEN "Payment_Mode" = \'Cash\' THEN 1 END) AS cash_bills'),
        db.raw('COUNT(CASE WHEN "Payment_Mode" = \'UPI\' THEN 1 END) AS upi_bills'),
        db.raw('COUNT(CASE WHEN "Payment_Mode" = \'Card\' THEN 1 END) AS card_bills')
      ).orderBy('total_revenue', 'desc');
    return sendSuccess(res, { counterStats, fromDate, toDate });
  } catch (err) {
    console.error('Counter summary error:', err);
    return sendError(res, 500, 'Failed to generate counter report.');
  }
});

// Branch filter here is legitimate, not a suppression risk: branches can
// carry their own GST_No (tbl_branch_master), so a per-branch GST summary
// is the correct report for a business with more than one GST
// registration — nothing is excluded from the real sales register, "All
// Branches" still shows the complete tenant-wide figure.
// GSTR-1 needs the CGST/SGST/IGST split (columns already existed on
// tbl_sales_header — added for exactly this — but this route only ever
// returned one blended total_gst), a B2B/B2C split (GST-registered
// customers file differently), and a real per-row tax rate on the HSN
// summary instead of one hardcoded gstRate:3 slapped on every invoice
// regardless of what it was actually billed at (found via audit).
// Deliberately NOT a full GSTR-1 JSON export (B2CL/B2CS threshold
// splitting, place-of-supply codes, the GSTN upload format) — that's a
// real, separate feature; this gets the underlying numbers right first.
router.get('/gst-summary', authenticate, requireValidBranch, async (req, res) => {
  const { fromDate, toDate } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'Date range required.');
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    const gstData = await excludeHiddenStockSales(withBranch(db('tbl_sales_header')
      .where('Tenant_ID', tenantId).where('Data_Mode', dm)
      .whereRaw(`DATE("Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .whereNot('Payment_Status', 'Cancelled').where('Invoice_Type', 'Tax Invoice'), req), req)
      .select(
        db.raw('SUM("Subtotal_Amount") as taxable_value'), db.raw('SUM("GST_Amount") as total_gst'),
        db.raw('SUM("CGST_Amount") as total_cgst'), db.raw('SUM("SGST_Amount") as total_sgst'), db.raw('SUM("IGST_Amount") as total_igst'),
        db.raw('SUM("Net_Payable_Amount") as total_invoice_value'), db.raw('COUNT(*) as invoice_count')
      )
      .first();

    // B2B vs B2C — a GST-registered customer (real GST_No on file) files
    // under B2B; everyone else is B2C. Two distinct queries rather than a
    // single GROUP BY so each side's own invoice_count/taxable_value stay
    // simple aggregates, not a join fan-out against sales_details below.
    let b2bQb = db('tbl_sales_header as sh')
      .join('tbl_customer_master as c', 'sh.Customer_ID', 'c.Customer_ID')
      .where('sh.Tenant_ID', tenantId).where('sh.Data_Mode', dm)
      .whereRaw(`DATE("sh"."Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .whereNot('sh.Payment_Status', 'Cancelled').where('sh.Invoice_Type', 'Tax Invoice')
      .whereNotNull('c.GST_No').where('c.GST_No', '!=', '');
    b2bQb = withBranch(b2bQb, req, 'sh.Branch_ID');
    const b2b = await excludeHiddenStockSales(b2bQb, req, 'sh')
      .select(db.raw('SUM("sh"."Subtotal_Amount") as taxable_value'), db.raw('SUM("sh"."GST_Amount") as gst_amount'), db.raw('COUNT(*) as invoice_count'))
      .first();
    let b2cQb = db('tbl_sales_header as sh')
      .leftJoin('tbl_customer_master as c', 'sh.Customer_ID', 'c.Customer_ID')
      .where('sh.Tenant_ID', tenantId).where('sh.Data_Mode', dm)
      .whereRaw(`DATE("sh"."Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .whereNot('sh.Payment_Status', 'Cancelled').where('sh.Invoice_Type', 'Tax Invoice')
      .where((b) => b.whereNull('c.GST_No').orWhere('c.GST_No', ''));
    b2cQb = withBranch(b2cQb, req, 'sh.Branch_ID');
    const b2c = await excludeHiddenStockSales(b2cQb, req, 'sh')
      .select(db.raw('SUM("sh"."Subtotal_Amount") as taxable_value'), db.raw('SUM("sh"."GST_Amount") as gst_amount'), db.raw('COUNT(*) as invoice_count'))
      .first();

    const hsnSummary = await excludeHiddenStockSales(withBranch(db('tbl_sales_details as sd')
      .join('tbl_sales_header as sh', 'sd.Sale_ID', 'sh.Sale_ID')
      .leftJoin('tbl_item_type_master as t', db.raw(`sd."Item_Type_Name" = t."Type_Name"`))
      .where('sh.Tenant_ID', tenantId).where('sh.Data_Mode', dm)
      .whereRaw(`DATE("sh"."Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .whereNot('sh.Payment_Status', 'Cancelled'), req, 'sh.Branch_ID'), req, 'sh')
      .groupByRaw(`COALESCE("t"."HSN_Code", '7113'), "sd"."GST_Percentage_Applied"`)
      .select(db.raw(`COALESCE("t"."HSN_Code", '7113') as hsn_code`), 'sd.GST_Percentage_Applied', db.raw('SUM("sd"."Taxable_Value") as taxable_value'), db.raw('SUM("sd"."GST_Amount") as gst_amount'), db.raw('COUNT(*) as items'), db.raw(`'PCS' as uqc`))
      .catch(() => []);
    return sendSuccess(res, {
      ...gstData,
      b2b: { taxable_value: b2b.taxable_value || 0, gst_amount: b2b.gst_amount || 0, invoice_count: parseInt(b2b.invoice_count) || 0 },
      b2c: { taxable_value: b2c.taxable_value || 0, gst_amount: b2c.gst_amount || 0, invoice_count: parseInt(b2c.invoice_count) || 0 },
      hsnSummary, fromDate, toDate,
    });
  } catch (err) {
    return sendError(res, 500, 'Failed to generate GST report.');
  }
});

// ─── GET /api/reports/item-wise-sales ─────────────────────────────────────────
router.get('/item-wise-sales', authenticate, async (req, res) => {
  const { fromDate, toDate, classification } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'Date range required.');
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    let qb = db('tbl_sales_details as sd')
      .join('tbl_sales_header as sh', 'sd.Sale_ID', 'sh.Sale_ID')
      .where('sh.Tenant_ID', tenantId).where('sh.Data_Mode', dm)
      .whereRaw(`DATE("sh"."Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .whereNot('sh.Payment_Status', 'Cancelled');
    // Optional operational filter (Special Stock spec, section 19) — this
    // narrows which rows are SHOWN, nothing more. It joins the ornament's
    // CURRENT Stock_Classification (a display tag that can be changed
    // after the sale), not a snapshot taken at sale time, so it's an
    // operational convenience, not a historical/audit record. Never
    // excludes anything from the underlying sales/accounting data itself —
    // that's a completely separate, unaffected table this filter doesn't touch.
    if (classification) {
      qb = qb.join('tbl_ornament_master as o', 'sd.Ornament_ID', 'o.Ornament_ID')
        .where('o.Stock_Classification', classification);
    }
    const data = await excludeHiddenStockSales(qb, req, 'sh')
      .groupBy('sd.Item_Type_Name')
      .select('sd.Item_Type_Name as Type_Name', db.raw('COUNT(*) as qty_sold'), db.raw('SUM("sd"."Gross_Weight") as total_weight'), db.raw('SUM("sd"."Total_Line_Price") as revenue'), db.raw('SUM("sd"."GST_Amount") as gst'))
      .orderBy('revenue', 'desc');
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, 500, 'Failed to generate item-wise sales report.');
  }
});

// ─── GET /api/reports/sales-returns ───────────────────────────────────────────
router.get('/sales-returns', authenticate, async (req, res) => {
  const { fromDate, toDate } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'Date range required.');
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    const data = await excludeHiddenStockSales(db('tbl_sales_header')
      .where('Tenant_ID', tenantId).where('Data_Mode', dm)
      .where('Payment_Status', 'Cancelled')
      .whereRaw(`DATE("Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate]), req)
      .orderBy('Sale_Date', 'desc');
    return sendSuccess(res, data);
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

// ─── GET /api/reports/branch-wise-sales ───────────────────────────────────────
router.get('/branch-wise-sales', authenticate, async (req, res) => {
  const { fromDate, toDate } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'Date range required.');
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    const data = await excludeHiddenStockSales(db('tbl_sales_header as s')
      .leftJoin('tbl_branch_master as b', 's.Branch_ID', 'b.Branch_ID')
      .where('s.Tenant_ID', tenantId).where('s.Data_Mode', dm)
      .whereRaw(`DATE("s"."Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .whereNot('s.Payment_Status', 'Cancelled'), req, 's')
      .groupByRaw('"s"."Branch_ID", COALESCE("b"."Branch_Name", \'Main Branch\')')
      .select(db.raw('COALESCE("b"."Branch_Name", \'Main Branch\') as branch_name'), db.raw('COUNT(*) as total_bills'), db.raw('SUM("s"."Net_Payable_Amount") as total_revenue'), db.raw('SUM("s"."GST_Amount") as total_gst'), db.raw('SUM("s"."Amount_Paid") as total_collected'))
      .orderBy('total_revenue', 'desc');
    return sendSuccess(res, data);
  } catch (err) { return sendError(res, 500, 'Failed to generate branch report.'); }
});

// ─── GET /api/reports/item-movement ───────────────────────────────────────────
router.get('/item-movement', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    const { metalType } = req.query;
    const thirtyDaysAgo = dayjs().subtract(30, 'day').format('YYYY-MM-DD'); // local (IST) day, not toISOString()'s UTC one

    let unsoldQb = db('tbl_ornament_master as o')
      .leftJoin('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .leftJoin('tbl_purity_master as p', 'o.Purity_ID', 'p.Purity_ID')
      .where('o.Tenant_ID', tenantId)
      .where('o.Is_Active', true).where('o.Is_Sold', false)
      .select('o.Ornament_ID', 'o.Article_Number', 'o.Metal_Type', db.raw('COALESCE("t"."Type_Name", \'Unknown\') as "Type_Name"'), db.raw('COALESCE("p"."Purity_Code", \'-\') as "Purity_Code"'), 'o.Gross_Weight', 'o.Total_Price', db.raw(`ROUND(EXTRACT(EPOCH FROM (NOW() - "o"."Created_Date")) / 86400) as days_in_stock`), db.raw('0 as sold_last_30_days'));
    if (metalType) unsoldQb = unsoldQb.where('o.Metal_Type', metalType);
    const unsold = await applyStockVisibility(unsoldQb, req, 'o');

    const recentSales = await excludeHiddenStockSales(db('tbl_sales_details as sd')
      .join('tbl_sales_header as sh', 'sd.Sale_ID', 'sh.Sale_ID')
      .where('sh.Tenant_ID', tenantId).where('sh.Data_Mode', dm)
      .whereRaw(`DATE("sh"."Sale_Date") >= ?`, [thirtyDaysAgo])
      .whereNot('sh.Payment_Status', 'Cancelled'), req, 'sh')
      .groupBy('sd.Item_Type_Name')
      .select('sd.Item_Type_Name', db.raw('COUNT(*) as sold_count'));

    const salesMap = Object.fromEntries(recentSales.map(r => [r.Item_Type_Name, parseInt(r.sold_count)]));
    const enriched = unsold.map(item => ({ ...item, days_in_stock: Math.round(parseFloat(item.days_in_stock || 0)), sold_last_30_days: salesMap[item.Type_Name] || 0 }));
    return sendSuccess(res, enriched);
  } catch (err) {
    console.error('Item movement error:', err.message);
    return sendError(res, 500, `Failed to generate movement report: ${err.message}`);
  }
});

// ─── GET /api/reports/financial ───────────────────────────────────────────────
// This used to be computed as a rough approximation straight off
// tbl_sales_header/tbl_purchase_header — no real double-entry behind it,
// receivables/advances/scheme liabilities hardcoded to 0, GST payable
// meant "collected" with no input-credit offset at all. Now backed by the
// real Chart of Accounts / journal engine (utils/accountingEngine.js,
// server/src/routes/accounting.js has the equivalent per-report endpoints
// this reuses the same underlying tables for) — same response shape the
// frontend already expects, so no frontend change was needed for this to
// become real.
router.get('/financial', authenticate, async (req, res) => {
  const { fromDate, toDate } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'Date range required.');
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);

    const accounts = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Is_Active: true });
    const byName = Object.fromEntries(accounts.map((a) => [a.Account_Name, a]));

    // Every journal entry for this tenant, ever — cheap enough at this
    // scale, and needed both for the period's books and for balances
    // computed as-of the period end (which include everything up to
    // then, not just entries strictly inside the date range).
    const allEntries = await db('tbl_accounting_entries as e')
      .join('tbl_accounting_journal as j', 'e.Journal_ID', 'j.Journal_ID')
      .where({ 'e.Tenant_ID': tenantId })
      .select('e.Account_ID', 'e.Entry_Type', 'e.Amount', 'e.Narration', 'j.Journal_Number', 'j.Entry_Date', 'j.Source_Type', 'j.Reference');

    const inWindow = allEntries.filter((e) => {
      const d = e.Entry_Date instanceof Date ? e.Entry_Date.toISOString().slice(0, 10) : String(e.Entry_Date).slice(0, 10);
      return d >= fromDate && d <= toDate;
    });
    const upToWindowEnd = allEntries.filter((e) => {
      const d = e.Entry_Date instanceof Date ? e.Entry_Date.toISOString().slice(0, 10) : String(e.Entry_Date).slice(0, 10);
      return d <= toDate;
    });

    const naturalSide = (account) => (['Assets', 'Expenses'].includes(account.Account_Group) ? 'Dr' : 'Cr');
    const balanceAsOf = (entries, accountNames) => {
      const ids = accountNames.map((n) => byName[n]?.Account_ID).filter(Boolean);
      let total = 0;
      for (const e of entries) {
        if (!ids.includes(e.Account_ID)) continue;
        const account = accounts.find((a) => a.Account_ID === e.Account_ID);
        const sign = e.Entry_Type === naturalSide(account) ? 1 : -1;
        total += sign * parseFloat(e.Amount);
      }
      return Math.round(total * 100) / 100;
    };
    const balanceOfSubGroup = (entries, group, sub) => balanceAsOf(entries, accounts.filter((a) => a.Account_Group === group && a.Account_Sub_Group === sub).map((a) => a.Account_Name));

    // ── Cash Book ──────────────────────────────────────────────────────────
    const cashAccountId = byName['Cash Account']?.Account_ID;
    const cashEntries = inWindow.filter((e) => e.Account_ID === cashAccountId).sort((a, b) => String(a.Entry_Date).localeCompare(String(b.Entry_Date)));
    let cashRunning = balanceAsOf(allEntries.filter((e) => {
      const d = e.Entry_Date instanceof Date ? e.Entry_Date.toISOString().slice(0, 10) : String(e.Entry_Date).slice(0, 10);
      return d < fromDate;
    }), ['Cash Account']);
    const cashBook = cashEntries.map((e) => {
      cashRunning += (e.Entry_Type === 'Dr' ? 1 : -1) * parseFloat(e.Amount);
      return { date: e.Entry_Date, particulars: e.Narration || e.Journal_Number, reference: e.Reference, debit: e.Entry_Type === 'Dr' ? parseFloat(e.Amount) : 0, credit: e.Entry_Type === 'Cr' ? parseFloat(e.Amount) : 0, balance: Math.round(cashRunning * 100) / 100 };
    });

    // ── Bank Book — every real bank ledger combined into one chronological
    // timeline (the frontend has a single Bank Book tab, not per-bank) ──────
    const bankAccountIds = accounts.filter((a) => a.Account_Group === 'Assets' && a.Account_Sub_Group === 'Bank').map((a) => a.Account_ID);
    const bankEntries = inWindow.filter((e) => bankAccountIds.includes(e.Account_ID)).sort((a, b) => String(a.Entry_Date).localeCompare(String(b.Entry_Date)));
    let bankRunning = 0;
    const bankBook = bankEntries.map((e) => {
      bankRunning += (e.Entry_Type === 'Dr' ? 1 : -1) * parseFloat(e.Amount);
      return { date: e.Entry_Date, particulars: e.Narration || e.Journal_Number, reference: e.Reference, debit: e.Entry_Type === 'Dr' ? parseFloat(e.Amount) : 0, credit: e.Entry_Type === 'Cr' ? parseFloat(e.Amount) : 0, balance: Math.round(bankRunning * 100) / 100 };
    });

    // ── Day Book — one row per voucher (not per entry line) ────────────────
    const bySourceLabel = { SALE: 'Sale', PURCHASE: 'Purchase', PAYMENT: 'Payment', RECEIPT: 'Receipt', CONTRA: 'Contra', JOURNAL: 'Journal', DAY_CLOSE: 'Day Close' };
    const byJournalNumber = {};
    for (const e of inWindow) (byJournalNumber[e.Journal_Number] = byJournalNumber[e.Journal_Number] || []).push(e);
    const dayBook = Object.values(byJournalNumber).map((lines) => {
      const first = lines[0];
      const amount = lines.filter((l) => l.Entry_Type === 'Dr').reduce((s, l) => s + parseFloat(l.Amount), 0);
      const modeLine = lines.find((l) => l.Entry_Type === 'Dr');
      return { date: first.Entry_Date, particulars: first.Narration || first.Journal_Number, type: bySourceLabel[first.Source_Type] || first.Source_Type, amount, mode: modeLine ? accounts.find((a) => a.Account_ID === modeLine.Account_ID)?.Account_Name : '-' };
    }).sort((a, b) => String(a.date).localeCompare(String(b.date)));

    // ── Ledger — every entry across every account in the period, each
    // carrying its OWN account's running balance (not a merged number
    // across different accounts, which wouldn't mean anything) ─────────────
    const ledgerRunning = {};
    for (const a of accounts) {
      ledgerRunning[a.Account_ID] = a.Opening_Balance_Type === naturalSide(a) ? parseFloat(a.Opening_Balance || 0) : -parseFloat(a.Opening_Balance || 0);
    }
    const priorToWindow = allEntries.filter((e) => {
      const d = e.Entry_Date instanceof Date ? e.Entry_Date.toISOString().slice(0, 10) : String(e.Entry_Date).slice(0, 10);
      return d < fromDate;
    });
    for (const e of priorToWindow) {
      const account = accounts.find((a) => a.Account_ID === e.Account_ID);
      if (!account) continue;
      ledgerRunning[e.Account_ID] += (e.Entry_Type === naturalSide(account) ? 1 : -1) * parseFloat(e.Amount);
    }
    const ledger = [...inWindow].sort((a, b) => String(a.Entry_Date).localeCompare(String(b.Entry_Date))).map((e) => {
      const account = accounts.find((a) => a.Account_ID === e.Account_ID);
      if (account) ledgerRunning[e.Account_ID] += (e.Entry_Type === naturalSide(account) ? 1 : -1) * parseFloat(e.Amount);
      return {
        date: e.Entry_Date, account: account?.Account_Name || e.Ledger_Account, particulars: e.Narration || e.Journal_Number,
        debit: e.Entry_Type === 'Dr' ? parseFloat(e.Amount) : 0, credit: e.Entry_Type === 'Cr' ? parseFloat(e.Amount) : 0,
        balance: account ? Math.round(ledgerRunning[e.Account_ID] * 100) / 100 : 0,
      };
    });

    // ── P&L — Sales/GST/Discounts still come from the sales header (already
    // accurate); Operating Expenses is now REAL (was hardcoded 0) ──────────
    const [salesTotals] = await excludeHiddenStockSales(db('tbl_sales_header')
      .where('Tenant_ID', tenantId).where('Data_Mode', dm)
      .whereRaw(`DATE("Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .whereNot('Payment_Status', 'Cancelled'), req)
      .select(db.raw('SUM("Net_Payable_Amount") as total_sales'), db.raw('SUM("GST_Amount") as total_gst'), db.raw('SUM("Discount_Amount") as total_discounts'));
    const [purchaseTotals] = await db('tbl_purchase_header')
      .where('Tenant_ID', tenantId).where('Data_Mode', dm)
      .whereRaw(`DATE("Purchase_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .select(db.raw('SUM("Total_Amount") as total_purchases')).catch(() => [{ total_purchases: 0 }]);
    const ts = salesTotals || {}; const tp = purchaseTotals || {};

    const expenseAccountIds = accounts.filter((a) => a.Account_Group === 'Expenses' && a.Account_Sub_Group === 'Indirect Expense').map((a) => a.Account_ID);
    const operatingExpenses = inWindow.filter((e) => expenseAccountIds.includes(e.Account_ID) && e.Entry_Type === 'Dr').reduce((s, e) => s + parseFloat(e.Amount), 0);

    const grossProfit = parseFloat(ts.total_sales || 0) - parseFloat(tp.total_purchases || 0) - parseFloat(ts.total_gst || 0);
    const netProfit = grossProfit - parseFloat(ts.total_discounts || 0) - operatingExpenses;
    const pnl = {
      total_sales: parseFloat(ts.total_sales || 0), total_purchases: parseFloat(tp.total_purchases || 0),
      total_gst: parseFloat(ts.total_gst || 0), total_discounts: parseFloat(ts.total_discounts || 0), total_making: 0,
      gross_profit: Math.round(grossProfit * 100) / 100, operating_expenses: Math.round(operatingExpenses * 100) / 100, net_profit: Math.round(netProfit * 100) / 100,
    };

    // ── Balance Sheet — every figure below is now a REAL ledger balance,
    // not a hardcoded 0 or a raw-table approximation ────────────────────────
    let stockValQb = db('tbl_ornament_master').where({ Tenant_ID: tenantId, Is_Sold: false, Is_Active: true }).select(db.raw('SUM("Total_Price") as mrp'));
    const [stockVal] = await applyStockVisibility(stockValQb, req);

    const cash = balanceAsOf(upToWindowEnd, ['Cash Account']);
    const bank = balanceOfSubGroup(upToWindowEnd, 'Assets', 'Bank');
    const receivables = balanceOfSubGroup(upToWindowEnd, 'Assets', 'Receivable');
    const advanceGiven = balanceAsOf(upToWindowEnd, ['Advance to Karigar Account']);
    const payables = balanceOfSubGroup(upToWindowEnd, 'Liabilities', 'Payable');
    const advanceReceived = balanceAsOf(upToWindowEnd, ['Customer Advance Account', 'Gift Voucher Account']);
    // Savings Scheme collections now post to this same ledger too (see
    // savingsScheme.js's /collect handler) — both the deposit side and
    // redemptions/adjustments flow through here, so this is a real balance,
    // not just the redemption half it used to be before that was wired up.
    // Digi Gold schemes (Scheme_Type/Scheme_Name containing "digi") post
    // to their own separate 'Digi Gold Liability Account' instead of
    // 'Customer Scheme Deposit Account' — found missing here while
    // seeding a real Digi Gold group/member: the balance sheet silently
    // understated liabilities by the whole Digi Gold balance for any
    // tenant actually running one.
    const schemeLiabilities = balanceAsOf(upToWindowEnd, ['Customer Scheme Deposit Account', 'Scheme Bonus Provision Account', 'Digi Gold Liability Account']);
    const gstPayable = balanceAsOf(upToWindowEnd, ['Output CGST Account', 'Output SGST Account', 'Output IGST Account'])
      - balanceAsOf(upToWindowEnd, ['Input CGST Account', 'Input SGST Account', 'Input IGST Account']);
    const capital = balanceAsOf(upToWindowEnd, ['Owner Capital Account', 'Retained Earnings Account']) + netProfit;

    const balanceSheet = {
      cash, bank, stock_value: parseFloat(stockVal?.mrp || 0), receivables, advance_given: advanceGiven,
      payables, advance_received: advanceReceived, scheme_liabilities: schemeLiabilities,
      gst_payable: Math.round(gstPayable * 100) / 100, capital: Math.round(capital * 100) / 100,
    };

    return sendSuccess(res, { cashBook, bankBook, dayBook, pnl, balanceSheet, ledger });
  } catch (err) {
    console.error('Financial report error:', err);
    return sendError(res, 500, 'Failed to generate financial reports.');
  }
});

// ─── GET /api/reports/customer-outstanding ────────────────────────────────────
router.get('/customer-outstanding', authenticate, requireValidBranch, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    const data = await excludeHiddenStockSales(withBranch(db('tbl_sales_header')
      .where('Tenant_ID', tenantId).where('Data_Mode', dm)
      .whereIn('Payment_Status', ['Partial', 'Pending']).whereNotNull('Customer_ID'), req), req)
      .groupByRaw('"Customer_ID", "Customer_Name", "Customer_Mobile"')
      .select('Customer_ID', 'Customer_Name', 'Customer_Mobile', db.raw('SUM("Net_Payable_Amount") as total_purchases'), db.raw('SUM("Amount_Paid") as total_paid'), db.raw('SUM("Balance_Amount") as outstanding'), db.raw('MAX("Sale_Date") as last_purchase_date'))
      .orderBy('outstanding', 'desc');
    return sendSuccess(res, data);
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

// ─── GET /api/reports/supplier-outstanding ────────────────────────────────────
// Mirrors customer-outstanding — tbl_vendor_master.Current_Balance and
// tbl_purchase_header.Balance_Amount already held exactly this data, but
// there was no report surfacing it (only a per-invoice Balance Due column
// on the Purchase page itself, no per-supplier rollup).
router.get('/supplier-outstanding', authenticate, requireValidBranch, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const data = await withBranch(db('tbl_purchase_header')
      .where('tbl_purchase_header.Tenant_ID', tenantId)
      .whereIn('tbl_purchase_header.Payment_Status', ['Partial', 'Pending'])
      .whereNotNull('tbl_purchase_header.Supplier_ID')
      .whereNot('tbl_purchase_header.Status', 'Cancelled'), req, 'tbl_purchase_header.Branch_ID')
      .join('tbl_vendor_master as v', 'v.Vendor_ID', 'tbl_purchase_header.Supplier_ID')
      .groupBy('tbl_purchase_header.Supplier_ID', 'v.Vendor_Name', 'v.Vendor_Code', 'v.Mobile_1')
      .select(
        'tbl_purchase_header.Supplier_ID', 'v.Vendor_Name', 'v.Vendor_Code', 'v.Mobile_1',
        db.raw('SUM("tbl_purchase_header"."Total_Amount") as total_purchases'),
        db.raw('SUM("tbl_purchase_header"."Amount_Paid") as total_paid'),
        db.raw('SUM("tbl_purchase_header"."Balance_Amount") as outstanding'),
        db.raw('MAX("tbl_purchase_header"."Purchase_Date") as last_purchase_date')
      )
      .orderBy('outstanding', 'desc');
    return sendSuccess(res, data);
  } catch (err) { return sendError(res, 500, 'Failed to fetch supplier outstanding.'); }
});

// ─── GET /api/reports/scheme-adjustments ─────────────────────────────────────
router.get('/scheme-adjustments', authenticate, async (req, res) => {
  const { fromDate, toDate } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'Date range required.');
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    const sales = await excludeHiddenStockSales(db('tbl_sales_header')
      .where('Tenant_ID', tenantId).where('Data_Mode', dm)
      .whereRaw(`DATE("Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .where(function () {
        this.where(db.raw('"Scheme_Adjustment_Amount" > 0')).orWhere(db.raw('"Bonus_Adjustment_Amount" > 0'));
      })
      .whereNot('Payment_Status', 'Cancelled'), req)
      .orderBy('Sale_Date', 'desc');

    const invoiceNumbers = sales.map(s => s.Invoice_Number);
    const txns = invoiceNumbers.length > 0
      ? await db('tbl_scheme_transactions as t')
          .join('tbl_scheme_members as m', 't.Member_ID', 'm.Member_ID')
          .where('t.Tenant_ID', tenantId).where('t.Txn_Type', 'Adjustment')
          .whereIn('t.Payment_Reference', invoiceNumbers)
          .select('t.Payment_Reference as Invoice_Number', 't.Receipt_Number', 't.Amount',
            'm.Member_ID', 'm.Member_Number', 'm.Member_Name', 'm.Mobile')
      : [];
    const byInvoice = {};
    txns.forEach(t => { if (!byInvoice[t.Invoice_Number]) byInvoice[t.Invoice_Number] = []; byInvoice[t.Invoice_Number].push(t); });

    const data = sales.map(s => ({ ...s, memberAdjustments: byInvoice[s.Invoice_Number] || [] }));
    return sendSuccess(res, data);
  } catch (err) { return sendError(res, 500, `Failed: ${err.message}`); }
});

// ─── GET /api/reports/old-gold-adjustments ───────────────────────────────────
router.get('/old-gold-adjustments', authenticate, async (req, res) => {
  const { fromDate, toDate } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'Date range required.');
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    const data = await excludeHiddenStockSales(db('tbl_old_gold_exchange as oge')
      .join('tbl_sales_header as sh', 'oge.Sale_ID', 'sh.Sale_ID')
      .where('oge.Tenant_ID', tenantId).where('oge.Data_Mode', dm)
      .whereRaw(`DATE("sh"."Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .whereNot('sh.Payment_Status', 'Cancelled'), req, 'sh')
      .select('oge.*', 'sh.Invoice_Number', 'sh.Customer_Name', 'sh.Customer_Mobile', 'sh.Sale_Date', 'sh.Net_Payable_Amount')
      .orderBy('sh.Sale_Date', 'desc');
    const totalValue = data.reduce((s, r) => s + parseFloat(r.Used_Amount || 0), 0);
    return sendSuccess(res, { items: data, totalValue });
  } catch (err) { return sendError(res, 500, `Failed: ${err.message}`); }
});

// ─── GET /api/reports/combined-adjustments ───────────────────────────────────
// Invoice / Old Gold / Scheme / Bonus / Final Payable per sale, per the spec's
// required calculation sequence.
router.get('/combined-adjustments', authenticate, async (req, res) => {
  const { fromDate, toDate } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'Date range required.');
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    const items = await excludeHiddenStockSales(db('tbl_sales_header')
      .where('Tenant_ID', tenantId).where('Data_Mode', dm)
      .whereRaw(`DATE("Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .whereNot('Payment_Status', 'Cancelled')
      .where(function () {
        this.where(db.raw('"Old_Gold_Exchange_Amount" > 0'))
          .orWhere(db.raw('"Scheme_Adjustment_Amount" > 0'))
          .orWhere(db.raw('"Bonus_Adjustment_Amount" > 0'));
      }), req)
      .select('Sale_ID', 'Invoice_Number', 'Sale_Date', 'Customer_Name', 'Customer_Mobile',
        'Subtotal_Amount', 'GST_Amount', 'Old_Gold_Exchange_Amount', 'Scheme_Adjustment_Amount',
        'Bonus_Adjustment_Amount', 'Voucher_Amount', 'Net_Payable_Amount', 'Amount_Paid', 'Balance_Amount', 'Payment_Status')
      .orderBy('Sale_Date', 'desc');
    const totals = items.reduce((acc, r) => {
      acc.oldGold += parseFloat(r.Old_Gold_Exchange_Amount || 0);
      acc.scheme += parseFloat(r.Scheme_Adjustment_Amount || 0);
      acc.bonus += parseFloat(r.Bonus_Adjustment_Amount || 0);
      acc.netPayable += parseFloat(r.Net_Payable_Amount || 0);
      return acc;
    }, { oldGold: 0, scheme: 0, bonus: 0, netPayable: 0 });
    return sendSuccess(res, { items, totals });
  } catch (err) { return sendError(res, 500, `Failed: ${err.message}`); }
});

// ─── GET /api/reports/approval-pending ────────────────────────────────────────
// One row per still-open voucher (Pending/Partial), tagged + non-tagged
// merged, with the pending-only item count/weight/value for that voucher.
router.get('/approval-pending', authenticate, async (req, res) => {
  const { partyId, fromDate, toDate } = req.query;
  try {
    const tenantId = req.user.tenantId;

    let taggedQb = db('tbl_approval_issue_header as h')
      .join('tbl_approval_issue_items as i', 'i.Issue_ID', 'h.Issue_ID')
      .leftJoin('tbl_approval_party_master as p', 'h.Party_ID', 'p.Party_ID')
      .where('h.Tenant_ID', tenantId).whereIn('h.Status', ['Pending', 'Partial'])
      .groupBy('h.Issue_ID', 'h.Voucher_Number', 'h.Issue_Date', 'h.Status', 'p.Party_Name', 'p.Mobile')
      .select('h.Issue_ID', 'h.Voucher_Number', 'h.Issue_Date', 'h.Status', 'p.Party_Name', 'p.Mobile',
        db.raw(`count(*) filter (where "i"."Item_Status" = 'Pending') as pending_items`),
        db.raw(`sum(case when "i"."Item_Status" = 'Pending' then "i"."Gross_Weight" else 0 end) as pending_weight`),
        db.raw(`sum(case when "i"."Item_Status" = 'Pending' then "i"."Approx_Value" else 0 end) as pending_value`));
    if (partyId) taggedQb = taggedQb.where('h.Party_ID', partyId);
    if (fromDate) taggedQb = taggedQb.where('h.Issue_Date', '>=', fromDate);
    if (toDate) taggedQb = taggedQb.where('h.Issue_Date', '<=', toDate);

    let ntaQb = db('tbl_non_tag_issue_header as h')
      .join('tbl_non_tag_issue_items as i', 'i.NTA_Issue_ID', 'h.NTA_Issue_ID')
      .leftJoin('tbl_approval_party_master as p', 'h.Party_ID', 'p.Party_ID')
      .where('h.Tenant_ID', tenantId).whereIn('h.Status', ['Pending', 'Partial'])
      .groupBy('h.NTA_Issue_ID', 'h.Voucher_Number', 'h.Issue_Date', 'h.Status', 'p.Party_Name', 'p.Mobile')
      .select('h.NTA_Issue_ID as Issue_ID', 'h.Voucher_Number', 'h.Issue_Date', 'h.Status', 'p.Party_Name', 'p.Mobile',
        db.raw(`count(*) filter (where "i"."Item_Status" = 'Pending') as pending_items`),
        db.raw(`sum(case when "i"."Item_Status" = 'Pending' then "i"."Gross_Weight" else 0 end) as pending_weight`),
        db.raw(`sum(case when "i"."Item_Status" = 'Pending' then "i"."Approx_Value" else 0 end) as pending_value`));
    if (partyId) ntaQb = ntaQb.where('h.Party_ID', partyId);
    if (fromDate) ntaQb = ntaQb.where('h.Issue_Date', '>=', fromDate);
    if (toDate) ntaQb = ntaQb.where('h.Issue_Date', '<=', toDate);

    const [tagged, nonTag] = await Promise.all([taggedQb, ntaQb]);
    const items = [
      ...tagged.map(r => ({ ...r, Item_Mode: 'Tagged' })),
      ...nonTag.map(r => ({ ...r, Item_Mode: 'Non-Tagged' })),
    ].filter(r => parseInt(r.pending_items, 10) > 0).sort((a, b) => new Date(b.Issue_Date) - new Date(a.Issue_Date));

    const totals = items.reduce((acc, r) => {
      acc.pendingItems += parseInt(r.pending_items || 0, 10);
      acc.pendingWeight += parseFloat(r.pending_weight || 0);
      acc.pendingValue += parseFloat(r.pending_value || 0);
      return acc;
    }, { pendingItems: 0, pendingWeight: 0, pendingValue: 0 });

    return sendSuccess(res, { items, totals });
  } catch (err) { return sendError(res, 500, `Failed: ${err.message}`); }
});

// ─── GET /api/reports/approval-issue ──────────────────────────────────────────
router.get('/approval-issue', authenticate, async (req, res) => {
  const { partyId, fromDate, toDate } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'Date range required.');
  try {
    const tenantId = req.user.tenantId;

    let taggedQb = db('tbl_approval_issue_header as h')
      .leftJoin('tbl_approval_party_master as p', 'h.Party_ID', 'p.Party_ID')
      .where('h.Tenant_ID', tenantId).whereRaw(`"h"."Issue_Date" BETWEEN ? AND ?`, [fromDate, toDate])
      .select('h.Issue_ID', 'h.Voucher_Number', 'h.Issue_Date', 'h.Status', 'p.Party_Name', 'p.Mobile',
        'h.Total_Items_Issued', 'h.Total_Weight_Issued', 'h.Total_Value_Issued');
    if (partyId) taggedQb = taggedQb.where('h.Party_ID', partyId);

    let ntaQb = db('tbl_non_tag_issue_header as h')
      .leftJoin('tbl_approval_party_master as p', 'h.Party_ID', 'p.Party_ID')
      .where('h.Tenant_ID', tenantId).whereRaw(`"h"."Issue_Date" BETWEEN ? AND ?`, [fromDate, toDate])
      .select('h.NTA_Issue_ID as Issue_ID', 'h.Voucher_Number', 'h.Issue_Date', 'h.Status', 'p.Party_Name', 'p.Mobile',
        'h.Total_Items_Issued', 'h.Total_Weight_Issued', 'h.Total_Value_Issued');
    if (partyId) ntaQb = ntaQb.where('h.Party_ID', partyId);

    const [tagged, nonTag] = await Promise.all([taggedQb, ntaQb]);
    const items = [
      ...tagged.map(r => ({ ...r, Item_Mode: 'Tagged' })),
      ...nonTag.map(r => ({ ...r, Item_Mode: 'Non-Tagged' })),
    ].sort((a, b) => new Date(b.Issue_Date) - new Date(a.Issue_Date));

    const totals = items.reduce((acc, r) => {
      acc.items += parseInt(r.Total_Items_Issued || 0, 10);
      acc.weight += parseFloat(r.Total_Weight_Issued || 0);
      acc.value += parseFloat(r.Total_Value_Issued || 0);
      return acc;
    }, { items: 0, weight: 0, value: 0 });

    return sendSuccess(res, { items, totals });
  } catch (err) { return sendError(res, 500, `Failed: ${err.message}`); }
});

// ─── GET /api/reports/approval-receive ────────────────────────────────────────
router.get('/approval-receive', authenticate, async (req, res) => {
  const { partyId, fromDate, toDate } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'Date range required.');
  try {
    const tenantId = req.user.tenantId;

    let taggedQb = db('tbl_approval_receive_header as r')
      .join('tbl_approval_issue_header as h', 'r.Issue_ID', 'h.Issue_ID')
      .leftJoin('tbl_approval_party_master as p', 'h.Party_ID', 'p.Party_ID')
      .where('r.Tenant_ID', tenantId).whereRaw(`"r"."Receive_Date" BETWEEN ? AND ?`, [fromDate, toDate])
      .select('r.Receive_ID', 'r.Voucher_Number', 'r.Receive_Date', 'h.Voucher_Number as Issue_Voucher_Number',
        'p.Party_Name', 'p.Mobile', 'r.Items_Received_Count', 'r.Total_Weight_Received', 'r.Total_Value_Received');
    if (partyId) taggedQb = taggedQb.where('h.Party_ID', partyId);

    let ntaQb = db('tbl_non_tag_receive_header as r')
      .join('tbl_non_tag_issue_header as h', 'r.NTA_Issue_ID', 'h.NTA_Issue_ID')
      .leftJoin('tbl_approval_party_master as p', 'h.Party_ID', 'p.Party_ID')
      .where('r.Tenant_ID', tenantId).whereRaw(`"r"."Receive_Date" BETWEEN ? AND ?`, [fromDate, toDate])
      .select('r.NTA_Receive_ID as Receive_ID', 'r.Voucher_Number', 'r.Receive_Date', 'h.Voucher_Number as Issue_Voucher_Number',
        'p.Party_Name', 'p.Mobile', 'r.Items_Received_Count', 'r.Total_Weight_Received', 'r.Total_Value_Received');
    if (partyId) ntaQb = ntaQb.where('h.Party_ID', partyId);

    const [tagged, nonTag] = await Promise.all([taggedQb, ntaQb]);
    const items = [
      ...tagged.map(r => ({ ...r, Item_Mode: 'Tagged' })),
      ...nonTag.map(r => ({ ...r, Item_Mode: 'Non-Tagged' })),
    ].sort((a, b) => new Date(b.Receive_Date) - new Date(a.Receive_Date));

    const totals = items.reduce((acc, r) => {
      acc.items += parseInt(r.Items_Received_Count || 0, 10);
      acc.weight += parseFloat(r.Total_Weight_Received || 0);
      acc.value += parseFloat(r.Total_Value_Received || 0);
      return acc;
    }, { items: 0, weight: 0, value: 0 });

    return sendSuccess(res, { items, totals });
  } catch (err) { return sendError(res, 500, `Failed: ${err.message}`); }
});

// ─── GET /api/reports/approval-outstanding ────────────────────────────────────
// Per-party rollup across ALL vouchers (not just currently-open ones):
// total issued vs total received vs still-pending count/weight/value.
router.get('/approval-outstanding', authenticate, async (req, res) => {
  const { partyId } = req.query;
  try {
    const tenantId = req.user.tenantId;

    let taggedQb = db('tbl_approval_party_master as p')
      .join('tbl_approval_issue_header as h', 'h.Party_ID', 'p.Party_ID')
      .join('tbl_approval_issue_items as i', 'i.Issue_ID', 'h.Issue_ID')
      .where('p.Tenant_ID', tenantId)
      .groupBy('p.Party_ID', 'p.Party_Name', 'p.Mobile')
      .select('p.Party_ID', 'p.Party_Name', 'p.Mobile',
        db.raw(`count(*) filter (where "i"."Item_Status" IN ('Pending','Received')) as total_issued`),
        db.raw(`count(*) filter (where "i"."Item_Status" = 'Received') as total_received`),
        db.raw(`count(*) filter (where "i"."Item_Status" = 'Pending') as pending_items`),
        db.raw(`sum(case when "i"."Item_Status" = 'Pending' then "i"."Gross_Weight" else 0 end) as pending_weight`),
        db.raw(`sum(case when "i"."Item_Status" = 'Pending' then "i"."Approx_Value" else 0 end) as pending_value`));
    if (partyId) taggedQb = taggedQb.where('p.Party_ID', partyId);

    let ntaQb = db('tbl_approval_party_master as p')
      .join('tbl_non_tag_issue_header as h', 'h.Party_ID', 'p.Party_ID')
      .join('tbl_non_tag_issue_items as i', 'i.NTA_Issue_ID', 'h.NTA_Issue_ID')
      .where('p.Tenant_ID', tenantId)
      .groupBy('p.Party_ID', 'p.Party_Name', 'p.Mobile')
      .select('p.Party_ID', 'p.Party_Name', 'p.Mobile',
        db.raw(`count(*) filter (where "i"."Item_Status" IN ('Pending','Received')) as total_issued`),
        db.raw(`count(*) filter (where "i"."Item_Status" = 'Received') as total_received`),
        db.raw(`count(*) filter (where "i"."Item_Status" = 'Pending') as pending_items`),
        db.raw(`sum(case when "i"."Item_Status" = 'Pending' then "i"."Gross_Weight" else 0 end) as pending_weight`),
        db.raw(`sum(case when "i"."Item_Status" = 'Pending' then "i"."Approx_Value" else 0 end) as pending_value`));
    if (partyId) ntaQb = ntaQb.where('p.Party_ID', partyId);

    const [tagged, nonTag] = await Promise.all([taggedQb, ntaQb]);
    const byParty = {};
    [...tagged, ...nonTag].forEach(r => {
      if (!byParty[r.Party_ID]) {
        byParty[r.Party_ID] = { Party_ID: r.Party_ID, Party_Name: r.Party_Name, Mobile: r.Mobile,
          total_issued: 0, total_received: 0, pending_items: 0, pending_weight: 0, pending_value: 0 };
      }
      const acc = byParty[r.Party_ID];
      acc.total_issued += parseInt(r.total_issued || 0, 10);
      acc.total_received += parseInt(r.total_received || 0, 10);
      acc.pending_items += parseInt(r.pending_items || 0, 10);
      acc.pending_weight += parseFloat(r.pending_weight || 0);
      acc.pending_value += parseFloat(r.pending_value || 0);
    });
    const items = Object.values(byParty).sort((a, b) => b.pending_value - a.pending_value);

    const totals = items.reduce((acc, r) => {
      acc.totalOut += r.pending_items;
      acc.pendingWeight += r.pending_weight;
      acc.pendingValue += r.pending_value;
      return acc;
    }, { totalOut: 0, pendingWeight: 0, pendingValue: 0 });

    return sendSuccess(res, { items, totals });
  } catch (err) { return sendError(res, 500, `Failed: ${err.message}`); }
});

// ─── GET /api/reports/collection-by-mode ─────────────────────────────────────
router.get('/collection-by-mode', authenticate, async (req, res) => {
  const { fromDate, toDate, mode } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'fromDate and toDate required.');
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    let qb = excludeHiddenStockSales(db('tbl_sales_payments as sp')
      .join('tbl_sales_header as sh', 'sp.Sale_ID', 'sh.Sale_ID')
      .where('sh.Tenant_ID', tenantId).where('sh.Data_Mode', dm)
      .whereRaw(`DATE("sh"."Sale_Date") BETWEEN ? AND ?`, [fromDate, toDate])
      .whereNot('sh.Payment_Status', 'Cancelled'), req, 'sh');
    if (mode) qb = qb.where('sp.Payment_Mode', mode);
    const byMode = await qb.clone().groupBy('sp.Payment_Mode').select('sp.Payment_Mode', db.raw('COUNT(DISTINCT "sp"."Sale_ID") as transactions'), db.raw('SUM("sp"."Amount") as amount')).orderBy('amount', 'desc');
    const byDay  = await qb.clone().groupByRaw(`DATE("sh"."Sale_Date"), "sp"."Payment_Mode"`).select(db.raw(`DATE("sh"."Sale_Date") as date`), 'sp.Payment_Mode', db.raw('SUM("sp"."Amount") as amount')).orderBy('date');
    return sendSuccess(res, { byMode, byDay, total: byMode.reduce((s, r) => s + parseFloat(r.amount||0), 0), fromDate, toDate });
  } catch (err) { return sendError(res, 500, `Failed: ${err.message}`); }
});

// ─── GET /api/reports/accounting-journal ─────────────────────────────────────
router.get('/accounting-journal', authenticate, async (req, res) => {
  const { fromDate, toDate, sourceType, page = 1, limit = 50 } = req.query;
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    let qb = db('tbl_accounting_journal').where('Tenant_ID', tenantId).where('Data_Mode', dm).orderBy('Entry_Date', 'desc').orderBy('Journal_ID', 'desc');
    if (fromDate)    qb = qb.whereRaw(`"Entry_Date" >= ?`, [fromDate]);
    if (toDate)      qb = qb.whereRaw(`"Entry_Date" <= ?`, [toDate]);
    if (sourceType)  qb = qb.where('Source_Type', sourceType);
    const [{ count }] = await qb.clone().count('Journal_ID as count');
    const journals = await qb.limit(parseInt(limit)).offset((parseInt(page)-1)*parseInt(limit));
    const journalIds = journals.map(j => j.Journal_ID);
    const entries = journalIds.length > 0 ? await db('tbl_accounting_entries').where('Data_Mode', dm).whereIn('Journal_ID', journalIds).orderBy('Entry_Type','desc') : [];
    const em = {};
    entries.forEach(e => { if (!em[e.Journal_ID]) em[e.Journal_ID] = []; em[e.Journal_ID].push(e); });
    return sendSuccess(res, { items: journals.map(j => ({ ...j, entries: em[j.Journal_ID]||[] })), total: parseInt(count) });
  } catch (err) { return sendError(res, 500, `Failed: ${err.message}`); }
});

// ─── GET /api/reports/ledger ──────────────────────────────────────────────────
router.get('/ledger', authenticate, async (req, res) => {
  const { account, fromDate, toDate } = req.query;
  if (!account) return sendError(res, 400, 'account name required.');
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    let qb = db('tbl_accounting_entries as ae')
      .join('tbl_accounting_journal as aj', 'ae.Journal_ID', 'aj.Journal_ID')
      .where('ae.Tenant_ID', tenantId).where('ae.Data_Mode', dm).where('ae.Ledger_Account', account)
      .select('ae.*', 'aj.Entry_Date', 'aj.Reference', 'aj.Narration as Journal_Narration', 'aj.Source_Type')
      .orderBy('aj.Entry_Date').orderBy('aj.Journal_ID');
    if (fromDate) qb = qb.whereRaw(`"aj"."Entry_Date" >= ?`, [fromDate]);
    if (toDate)   qb = qb.whereRaw(`"aj"."Entry_Date" <= ?`, [toDate]);
    const rows = await qb;
    let balance = 0, totalDr = 0, totalCr = 0;
    const ledger = rows.map(r => { const amt = parseFloat(r.Amount||0); if (r.Entry_Type==='Dr'){balance+=amt;totalDr+=amt;}else{balance-=amt;totalCr+=amt;} return {...r,running_balance:balance}; });
    return sendSuccess(res, { account, ledger, totalDr, totalCr, closing_balance: balance });
  } catch (err) { return sendError(res, 500, `Failed: ${err.message}`); }
});

// ─── GET /api/reports/day-book ────────────────────────────────────────────────
router.get('/day-book', authenticate, async (req, res) => {
  const { date } = req.query;
  const targetDate = date || dayjs().format('YYYY-MM-DD'); // local (IST) day, not toISOString()'s UTC one
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    const journals = await db('tbl_accounting_journal').where('Tenant_ID', tenantId).where('Data_Mode', dm).whereRaw(`"Entry_Date" = ?`, [targetDate]).orderBy('Journal_ID');
    const journalIds = journals.map(j => j.Journal_ID);
    const entries = journalIds.length > 0 ? await db('tbl_accounting_entries').where('Data_Mode', dm).whereIn('Journal_ID', journalIds) : [];
    const em = {};
    entries.forEach(e => { if (!em[e.Journal_ID]) em[e.Journal_ID] = []; em[e.Journal_ID].push(e); });
    const totalDr = entries.filter(e => e.Entry_Type==='Dr').reduce((s,e) => s+parseFloat(e.Amount||0), 0);
    const totalCr = entries.filter(e => e.Entry_Type==='Cr').reduce((s,e) => s+parseFloat(e.Amount||0), 0);
    return sendSuccess(res, { date: targetDate, journals: journals.map(j => ({...j, entries: em[j.Journal_ID]||[]})), totalDr, totalCr, balanced: Math.abs(totalDr-totalCr)<0.01 });
  } catch (err) { return sendError(res, 500, `Failed: ${err.message}`); }
});

// ─── GET /api/reports/cash-book ───────────────────────────────────────────────
router.get('/cash-book', authenticate, async (req, res) => {
  const { fromDate, toDate, account = 'Cash Account' } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'Date range required.');
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    const rows = await db('tbl_accounting_entries as ae')
      .join('tbl_accounting_journal as aj', 'ae.Journal_ID', 'aj.Journal_ID')
      .where('ae.Tenant_ID', tenantId).where('ae.Data_Mode', dm).where('ae.Ledger_Account', account)
      .whereRaw(`"aj"."Entry_Date" BETWEEN ? AND ?`, [fromDate, toDate])
      .select('ae.*', 'aj.Entry_Date', 'aj.Reference', 'aj.Source_Type')
      .orderBy('aj.Entry_Date').orderBy('aj.Journal_ID');
    let balance = 0, totalIn = 0, totalOut = 0;
    const book = rows.map(r => { const amt = parseFloat(r.Amount||0); if (r.Entry_Type==='Dr'){balance+=amt;totalIn+=amt;}else{balance-=amt;totalOut+=amt;} return {...r,balance}; });
    return sendSuccess(res, { account, entries: book, totalIn, totalOut, closing_balance: balance, fromDate, toDate });
  } catch (err) { return sendError(res, 500, `Failed: ${err.message}`); }
});

// ─── GET /api/reports/closing-report ──────────────────────────────────────────
router.get('/closing-report', authenticate, async (req, res) => {
  const { fromDate, toDate, metal = 'All' } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'fromDate and toDate required.');
  try {
    const result = await computeClosingReport({ tenantId: req.user.tenantId, req, fromDate, toDate, metal });
    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, 500, `Failed to generate closing report: ${err.message}`);
  }
});

// ─── GET /api/reports/closing-report/pdf ──────────────────────────────────────
router.get('/closing-report/pdf', authenticate, async (req, res) => {
  const { fromDate, toDate, metal = 'All' } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'fromDate and toDate required.');
  try {
    const pdfBuffer = await generateClosingReportPDF({ tenantId: req.user.tenantId, req, fromDate, toDate, metal });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="closing-report-${fromDate}-to-${toDate}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('Closing report PDF error:', err);
    return sendError(res, 500, 'Failed to generate PDF.');
  }
});

// ─── GET /api/reports/catalog-hidden-stock ────────────────────────────────────
// Isolated view of items currently hidden from the customer-facing catalog
// (Show_In_Catalog=false — see productCatalog.js's file-level note). This is
// purely a filter on the SAME sales data every other report reads (left
// join to tbl_sales_details/tbl_sales_header, same Data_Mode scoping as
// item-wise-sales above) — nothing here is excluded from, or missing from,
// the normal sales/GST reports. No special permission or Unofficial-mode
// gate, unlike /floors/reports/hidden-stock-sales (a different, unrelated
// feature — see that route's own comment for why it IS gated).
router.get('/catalog-hidden-stock', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    const items = await db('tbl_ornament_master as o')
      .leftJoin('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .leftJoin('tbl_sales_details as sd', 'o.Ornament_ID', 'sd.Ornament_ID')
      .leftJoin('tbl_sales_header as sh', function () {
        this.on('sd.Sale_ID', '=', 'sh.Sale_ID').andOnVal('sh.Payment_Status', '!=', 'Cancelled');
      })
      .where('o.Tenant_ID', tenantId).where('o.Is_Active', true)
      .where('o.Show_In_Catalog', false)
      .where('o.Data_Mode', dm)
      .select(
        'o.Ornament_ID', 'o.Article_Number', 't.Type_Name', 'o.Gross_Weight', 'o.Total_Price',
        'o.Is_Sold', 'o.Last_Updated_By', 'o.Last_Updated_Date',
        'sh.Invoice_Number', 'sh.Sale_Date', 'sh.Customer_Name', 'sd.Total_Line_Price'
      )
      .orderBy('o.Last_Updated_Date', 'desc');

    const summary = {
      total_hidden: items.length,
      sold_count: items.filter(i => i.Is_Sold).length,
      available_count: items.filter(i => !i.Is_Sold).length,
      total_weight: items.reduce((s, i) => s + parseFloat(i.Gross_Weight || 0), 0),
      total_value: items.reduce((s, i) => s + parseFloat(i.Total_Price || 0), 0),
    };
    return sendSuccess(res, { summary, items });
  } catch (err) {
    console.error('Catalog-hidden stock report error:', err.message);
    return sendError(res, 500, 'Failed to generate catalog-hidden stock report.');
  }
});

// ─── GET /api/reports/stock-classification-summary ───────────────────────────
// Normal vs Special Stock breakdown, overall and per metal — the
// "800 + 175 = 975" reconciliation from the Special Stock spec, made an
// explicit, checkable number rather than something someone has to add up
// by hand across two screens. Stock_Classification is a pure display tag
// (see its migration's header comment) — this report reads the exact same
// live tbl_ornament_master every other stock report reads, just grouped
// by that one extra column. No permission gate beyond normal report
// access — unlike /floors/hidden-stock and its siblings, there is nothing
// here that needs hiding from anyone.
router.get('/stock-classification-summary', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    const rows = await db('tbl_ornament_master')
      .where('Tenant_ID', tenantId).where('Is_Active', true).where('Is_Sold', false)
      .where('Data_Mode', dm)
      .groupBy('Stock_Classification', 'Metal_Type')
      .select(
        'Stock_Classification', 'Metal_Type',
        db.raw('COUNT(*) as pieces'),
        db.raw('SUM("Gross_Weight") as total_weight'),
        db.raw('SUM("Total_Price") as total_value'),
      );

    const byMetal = {};
    const overall = { Normal: { pieces: 0, weight: 0, value: 0 }, Special: { pieces: 0, weight: 0, value: 0 } };
    for (const r of rows) {
      const cls = r.Stock_Classification;
      const metal = r.Metal_Type || 'Gold';
      byMetal[metal] = byMetal[metal] || { Normal: { pieces: 0, weight: 0, value: 0 }, Special: { pieces: 0, weight: 0, value: 0 } };
      const entry = { pieces: parseInt(r.pieces), weight: parseFloat(r.total_weight || 0), value: parseFloat(r.total_value || 0) };
      byMetal[metal][cls] = entry;
      overall[cls].pieces += entry.pieces;
      overall[cls].weight += entry.weight;
      overall[cls].value += entry.value;
    }

    const combined = {
      pieces: overall.Normal.pieces + overall.Special.pieces,
      weight: Math.round((overall.Normal.weight + overall.Special.weight) * 1000) / 1000,
      value: Math.round((overall.Normal.value + overall.Special.value) * 100) / 100,
    };

    return sendSuccess(res, { normal: overall.Normal, special: overall.Special, combined, byMetal });
  } catch (err) {
    console.error('Stock classification summary error:', err.message);
    return sendError(res, 500, 'Failed to generate stock classification summary.');
  }
});

// ─── GET /api/reports/karigar-performance ─────────────────────────────────────
// "Which karigar's items sell fastest, and whose work comes back for
// repair most" — per-karigar analytics built from data that already
// exists (manufacturing attribution on tbl_ornament_master.Karigar_ID,
// actual sales, and the repair-order original-karigar link added in
// 20260826120000_add_repair_original_sale_link.js). Repair_Rate is a
// DERIVED quality proxy (repairs traced back to this karigar's own work,
// as a share of what they've sold) — not a manual rating, since it's
// computable from real records rather than relying on someone remembering
// to score it.
router.get('/karigar-performance', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const manufactured = await db('tbl_ornament_master as o')
      .join('tbl_vendor_master as v', 'o.Karigar_ID', 'v.Vendor_ID')
      .where('o.Tenant_ID', tenantId).where('o.Is_Active', true).whereNotNull('o.Karigar_ID')
      .groupBy('o.Karigar_ID', 'v.Vendor_Name', 'v.Vendor_Code')
      .select('o.Karigar_ID', 'v.Vendor_Name', 'v.Vendor_Code', db.raw('COUNT(*) as pieces_manufactured'));

    const sold = await db('tbl_ornament_master as o')
      .join('tbl_sales_details as sd', 'sd.Ornament_ID', 'o.Ornament_ID')
      .join('tbl_sales_header as sh', 'sd.Sale_ID', 'sh.Sale_ID')
      .where('o.Tenant_ID', tenantId).whereNotNull('o.Karigar_ID')
      .whereNot('sh.Payment_Status', 'Cancelled')
      .groupBy('o.Karigar_ID')
      .select(
        'o.Karigar_ID',
        db.raw('COUNT(*) as pieces_sold'),
        db.raw('SUM("sd"."Total_Line_Price") as revenue'),
        db.raw('AVG(EXTRACT(EPOCH FROM ("sh"."Sale_Date" - "o"."Created_Date")) / 86400) as avg_days_to_sell'),
      );

    const repairs = await db('tbl_repair_orders')
      .where('Tenant_ID', tenantId).whereNotNull('Original_Karigar_ID')
      .groupBy('Original_Karigar_ID')
      .select('Original_Karigar_ID as Karigar_ID', db.raw('COUNT(*) as repair_count'));

    const soldMap = Object.fromEntries(sold.map(r => [r.Karigar_ID, r]));
    const repairMap = Object.fromEntries(repairs.map(r => [r.Karigar_ID, parseInt(r.repair_count)]));

    const data = manufactured.map(m => {
      const s = soldMap[m.Karigar_ID] || {};
      const piecesSold = parseInt(s.pieces_sold || 0);
      const piecesManufactured = parseInt(m.pieces_manufactured);
      const repairCount = repairMap[m.Karigar_ID] || 0;
      return {
        Karigar_ID: m.Karigar_ID, Vendor_Name: m.Vendor_Name, Vendor_Code: m.Vendor_Code,
        pieces_manufactured: piecesManufactured,
        pieces_sold: piecesSold,
        pieces_in_stock: piecesManufactured - piecesSold,
        revenue: parseFloat(s.revenue || 0),
        avg_days_to_sell: s.avg_days_to_sell != null ? Math.round(parseFloat(s.avg_days_to_sell)) : null,
        sell_through_rate: piecesManufactured > 0 ? Math.round((piecesSold / piecesManufactured) * 1000) / 10 : 0,
        repair_count: repairCount,
        // Quality proxy — repairs traced to this karigar's own work, as a
        // share of what they've sold. Null (not 0) when nothing's sold yet
        // — a 0% repair rate with zero sales is meaningless, not "perfect."
        repair_rate: piecesSold > 0 ? Math.round((repairCount / piecesSold) * 1000) / 10 : null,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    return sendSuccess(res, data);
  } catch (err) {
    console.error('Karigar performance report error:', err.message);
    return sendError(res, 500, 'Failed to generate karigar performance report.');
  }
});

// ─── GET /api/reports/design-performance ──────────────────────────────────────
// "Which design is good" — per-design sell-through and velocity, same
// shape as karigar-performance above.
router.get('/design-performance', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const manufactured = await db('tbl_ornament_master as o')
      .join('tbl_design_master as d', 'o.Design_ID', 'd.Design_ID')
      .where('o.Tenant_ID', tenantId).where('o.Is_Active', true).whereNotNull('o.Design_ID')
      .groupBy('o.Design_ID', 'd.Design_Name', 'd.Design_Code')
      .select('o.Design_ID', 'd.Design_Name', 'd.Design_Code', db.raw('COUNT(*) as pieces_manufactured'));

    const sold = await db('tbl_ornament_master as o')
      .join('tbl_sales_details as sd', 'sd.Ornament_ID', 'o.Ornament_ID')
      .join('tbl_sales_header as sh', 'sd.Sale_ID', 'sh.Sale_ID')
      .where('o.Tenant_ID', tenantId).whereNotNull('o.Design_ID')
      .whereNot('sh.Payment_Status', 'Cancelled')
      .groupBy('o.Design_ID')
      .select(
        'o.Design_ID',
        db.raw('COUNT(*) as pieces_sold'),
        db.raw('SUM("sd"."Total_Line_Price") as revenue'),
        db.raw('AVG(EXTRACT(EPOCH FROM ("sh"."Sale_Date" - "o"."Created_Date")) / 86400) as avg_days_to_sell'),
      );
    const soldMap = Object.fromEntries(sold.map(r => [r.Design_ID, r]));

    const data = manufactured.map(m => {
      const s = soldMap[m.Design_ID] || {};
      const piecesSold = parseInt(s.pieces_sold || 0);
      const piecesManufactured = parseInt(m.pieces_manufactured);
      return {
        Design_ID: m.Design_ID, Design_Name: m.Design_Name, Design_Code: m.Design_Code,
        pieces_manufactured: piecesManufactured,
        pieces_sold: piecesSold,
        pieces_in_stock: piecesManufactured - piecesSold,
        revenue: parseFloat(s.revenue || 0),
        avg_days_to_sell: s.avg_days_to_sell != null ? Math.round(parseFloat(s.avg_days_to_sell)) : null,
        sell_through_rate: piecesManufactured > 0 ? Math.round((piecesSold / piecesManufactured) * 1000) / 10 : 0,
      };
    }).sort((a, b) => b.pieces_sold - a.pieces_sold);

    return sendSuccess(res, data);
  } catch (err) {
    console.error('Design performance report error:', err.message);
    return sendError(res, 500, 'Failed to generate design performance report.');
  }
});

// ─── GET /api/reports/branch-performance ──────────────────────────────────────
// Multi-Branch Management spec §9-11/32-33/38 — the "All Branches"
// dashboard: per-branch comparison + ranking, plus a consolidated total
// (same reconciliation-table pattern as stock-classification-summary).
// Only meaningful for someone who can actually see more than one branch
// — gated the same way the branch selector itself is (getAllowedBranches),
// not a separate permission, since "can you see All Branches" already IS
// exactly this question.
router.get('/branch-performance', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const access = await getAllowedBranches(req);
    if (!access.allBranches && access.branchIds.length <= 1) {
      return sendError(res, 403, 'Branch performance comparison requires access to more than one branch.');
    }
    const dm = modeVal(req);
    const today = dayjs().format('YYYY-MM-DD');
    const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
    const branchFilter = (qb, col) => access.allBranches ? qb : qb.whereIn(col, access.branchIds);

    const branches = await branchFilter(
      db('tbl_branch_master').where({ Tenant_ID: tenantId, Is_Active: true }), 'Branch_ID'
    ).select('Branch_ID', 'Branch_Name', 'Is_Head_Office');

    // Sales — today and month-to-date, per branch, in one pass (COUNT/SUM
    // with a CASE for "today" avoids two separate scans of the same rows).
    const salesRows = await branchFilter(
      db('tbl_sales_header')
        .where({ Tenant_ID: tenantId, Data_Mode: dm })
        .where('Sale_Date', '>=', monthStart)
        .whereNot('Payment_Status', 'Cancelled')
        .whereNotNull('Branch_ID'),
      'Branch_ID'
    )
      .groupBy('Branch_ID')
      .select(
        'Branch_ID',
        db.raw(`SUM(CASE WHEN DATE("Sale_Date") = ? THEN "Net_Payable_Amount" ELSE 0 END) as today_sales`, [today]),
        db.raw(`COUNT(CASE WHEN DATE("Sale_Date") = ? THEN 1 END) as today_bills`, [today]),
        db.raw('SUM("Net_Payable_Amount") as month_sales'),
        db.raw('SUM("Balance_Amount") as outstanding'),
      );
    const salesMap = Object.fromEntries(salesRows.map(r => [r.Branch_ID, r]));

    // Stock — pieces/weight/value still in stock, per branch.
    const stockRows = await branchFilter(
      db('tbl_ornament_master').where({ Tenant_ID: tenantId, Is_Active: true, Is_Sold: false }),
      'Branch_ID'
    )
      .groupBy('Branch_ID')
      .select(
        'Branch_ID',
        db.raw('COUNT(*) as pieces'),
        db.raw('SUM("Gross_Weight") as weight'),
        db.raw('SUM("Total_Price") as value'),
        db.raw(`SUM(CASE WHEN "Metal_Type"='Gold' THEN "Gross_Weight" ELSE 0 END) as gold_weight`),
        db.raw(`SUM(CASE WHEN "Metal_Type"='Silver' THEN "Gross_Weight" ELSE 0 END) as silver_weight`),
        db.raw('SUM(CASE WHEN "Is_On_Approval" THEN 1 ELSE 0 END) as approval_pieces'),
      );
    const stockMap = Object.fromEntries(stockRows.map(r => [r.Branch_ID, r]));

    // Sold pieces this month, per branch — separate from the stock query
    // above (that one is Is_Sold=false, this is a sales-details count).
    const soldRows = await branchFilter(
      db('tbl_sales_details as sd')
        .join('tbl_sales_header as sh', 'sd.Sale_ID', 'sh.Sale_ID')
        .where('sh.Tenant_ID', tenantId).where('sh.Data_Mode', dm)
        .where('sh.Sale_Date', '>=', monthStart)
        .whereNot('sh.Payment_Status', 'Cancelled')
        .whereNotNull('sh.Branch_ID'),
      'sh.Branch_ID'
    ).groupBy('sh.Branch_ID').select('sh.Branch_ID', db.raw('COUNT(*) as sold_pieces'));
    const soldMap = Object.fromEntries(soldRows.map(r => [r.Branch_ID, parseInt(r.sold_pieces)]));

    // Customers whose primary branch is this one (§18 — an attribute, not
    // an isolation boundary, so this is "customers based here," not "every
    // customer this branch has ever served").
    const customerRows = await branchFilter(
      db('tbl_customer_master').where({ Tenant_ID: tenantId, Is_Active: true, Data_Mode: dm }).whereNotNull('Branch_ID'),
      'Branch_ID'
    ).groupBy('Branch_ID').select('Branch_ID', db.raw('COUNT(*) as customers'));
    const customerMap = Object.fromEntries(customerRows.map(r => [r.Branch_ID, parseInt(r.customers)]));

    const rows = branches.map(b => {
      const s = salesMap[b.Branch_ID] || {};
      const st = stockMap[b.Branch_ID] || {};
      return {
        Branch_ID: b.Branch_ID, Branch_Name: b.Branch_Name, Is_Head_Office: b.Is_Head_Office,
        today_sales: parseFloat(s.today_sales || 0), today_bills: parseInt(s.today_bills || 0),
        month_sales: parseFloat(s.month_sales || 0), outstanding: parseFloat(s.outstanding || 0),
        stock_pieces: parseInt(st.pieces || 0), stock_weight: parseFloat(st.weight || 0), stock_value: parseFloat(st.value || 0),
        gold_weight: parseFloat(st.gold_weight || 0), silver_weight: parseFloat(st.silver_weight || 0),
        approval_pieces: parseInt(st.approval_pieces || 0),
        sold_pieces_month: soldMap[b.Branch_ID] || 0,
        customers: customerMap[b.Branch_ID] || 0,
      };
    });

    const combined = rows.reduce((acc, r) => ({
      today_sales: acc.today_sales + r.today_sales, month_sales: acc.month_sales + r.month_sales,
      outstanding: acc.outstanding + r.outstanding, stock_pieces: acc.stock_pieces + r.stock_pieces,
      stock_weight: acc.stock_weight + r.stock_weight, stock_value: acc.stock_value + r.stock_value,
      gold_weight: acc.gold_weight + r.gold_weight, silver_weight: acc.silver_weight + r.silver_weight,
      approval_pieces: acc.approval_pieces + r.approval_pieces, sold_pieces_month: acc.sold_pieces_month + r.sold_pieces_month,
      customers: acc.customers + r.customers,
    }), { today_sales: 0, month_sales: 0, outstanding: 0, stock_pieces: 0, stock_weight: 0, stock_value: 0, gold_weight: 0, silver_weight: 0, approval_pieces: 0, sold_pieces_month: 0, customers: 0 });

    // Ranking (§11) — dynamic on whatever range was actually requested
    // (today vs month), not hardcoded to one or the other.
    const rankedByToday = [...rows].sort((a, b) => b.today_sales - a.today_sales).map(r => ({ Branch_Name: r.Branch_Name, value: r.today_sales }));
    const rankedByMonth = [...rows].sort((a, b) => b.month_sales - a.month_sales).map(r => ({ Branch_Name: r.Branch_Name, value: r.month_sales }));
    const rankedByStock = [...rows].sort((a, b) => b.stock_value - a.stock_value).map(r => ({ Branch_Name: r.Branch_Name, value: r.stock_value }));

    return sendSuccess(res, {
      branches: rows, combined,
      ranking: { byTodaySales: rankedByToday, byMonthSales: rankedByMonth, byStockValue: rankedByStock },
      highest: rows.length ? rankedByToday[0]?.Branch_Name : null,
      lowest: rows.length ? rankedByToday[rankedByToday.length - 1]?.Branch_Name : null,
    });
  } catch (err) {
    console.error('Branch performance report error:', err.message);
    return sendError(res, 500, 'Failed to generate branch performance report.');
  }
});

module.exports = router;
