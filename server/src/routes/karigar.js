const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');
const { generateIssueNumber, generateReturnNumber } = require('../utils/invoiceNumber');
const { auditLog } = require('../utils/auditLogger');
const { modeVal } = require('../utils/dataModeFilter');
const { requireValidBranch, withBranch, resolveBranchForInsert, branchVal } = require('../utils/branchAccess');
const { postJournal } = require('../utils/accountingEngine');
const { resolveLedgerForPayment } = require('../utils/paymentLedgerMap');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ─── GET /api/karigar/list ────────────────────────────────────────────────────
router.get('/list', authenticate, async (req, res) => {
  try {
    const karigars = await db('tbl_vendor_master')
      .where({ Tenant_ID: req.user.tenantId, Is_Active: true })
      .whereIn('Vendor_Type', ['Karigar', 'Both'])
      .orderBy('Vendor_Name');
    return sendSuccess(res, karigars);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch karigars.');
  }
});

// ─── POST /api/karigar/issue ──────────────────────────────────────────────────
router.post('/issue', authenticate, requirePermission('karigar_management'), requireValidBranch, [
  body('Karigar_ID').isInt().withMessage('Karigar ID required'),
  body('Gold_Weight_Issued').isFloat({ min: 0.001 }).withMessage('Gold weight required'),
  body('Gold_Rate_At_Issue').isFloat({ min: 1 }).withMessage('Gold rate required'),
  body('Issue_Date').isISO8601().withMessage('Issue date required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  try {
    const tenantId = req.user.tenantId;
    const issueNumber = await generateIssueNumber(tenantId);

    const goldWeight = parseFloat(req.body.Gold_Weight_Issued);
    const goldRate = parseFloat(req.body.Gold_Rate_At_Issue);
    const wagesRate = parseFloat(req.body.Karigar_Wages_Rate || 0);
    const totalValue = goldWeight * goldRate;
    const estimatedWages = goldWeight * wagesRate;

    const [issue] = await db('tbl_issue_to_karigar').insert({
      ...req.body,
      Tenant_ID: tenantId,
      // Multi-Branch Management — see utils/branchAccess.js.
      Branch_ID: resolveBranchForInsert(req, req.body.Branch_ID),
      Issue_Number: issueNumber,
      Total_Value_Issued: totalValue,
      Estimated_Wages: estimatedWages,
      Status: 'Issued',
      Data_Mode: modeVal(req),
      Created_By: req.user.username,
    }).returning('*');

    await auditLog({ tenantId, userId: req.user.userId, tableName: 'tbl_issue_to_karigar', recordId: issue.Issue_ID, actionType: 'INSERT', newData: issue, req });

    // Gold physically leaving the premises had zero inventory or ledger
    // impact at all (found via audit) — Trial Balance showed gold still
    // in the shop while it sat at a goldsmith's bench. Dr a real "Gold
    // with Karigar" asset (money hasn't left the business, it's just
    // moved form), Cr Gold Stock. Reversed at return time below.
    await postJournal({
      tenantId, sourceType: 'JOURNAL', sourceId: issue.Issue_ID, reference: `KARIGAR-ISSUE-${issueNumber}`, branchId: issue.Branch_ID,
      narration: `Gold issued to karigar — ${issueNumber}`, createdBy: req.user.username, dataMode: modeVal(req),
      lines: [
        { account: 'Gold with Karigar Account', group: 'Assets', sub: 'Inventory', type: 'Dr', amount: totalValue, narration: `Issued | ${issueNumber}` },
        { account: 'Gold Stock Account', group: 'Assets', sub: 'Inventory', type: 'Cr', amount: totalValue, narration: `Issued | ${issueNumber}` },
      ],
    }).catch((e) => console.error('[Karigar] Issue ledger post failed (issue still recorded fine):', e.message));

    return sendSuccess(res, issue, 'Gold issued to karigar successfully.', 201);
  } catch (err) {
    console.error('Issue error:', err);
    return sendError(res, 500, 'Failed to issue gold.');
  }
});

// ─── GET /api/karigar/issue/:id ───────────────────────────────────────────────
router.get('/issue/:id', authenticate, async (req, res) => {
  try {
    const issue = await db('tbl_issue_to_karigar as i')
      .leftJoin('tbl_vendor_master as v', 'i.Karigar_ID', 'v.Vendor_ID')
      .leftJoin('tbl_purity_master as p', 'i.Purity_ID', 'p.Purity_ID')
      .leftJoin('tbl_design_master as d', 'i.Design_ID', 'd.Design_ID')
      .where({ 'i.Issue_ID': req.params.id })
      .select('i.*', 'v.Vendor_Name as Karigar_Name', 'p.Purity_Code', 'd.Design_Name')
      .first();
    if (!issue) return sendError(res, 404, 'Issue record not found.');
    return sendSuccess(res, issue);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch issue details.');
  }
});

// ─── GET /api/karigar/issues ──────────────────────────────────────────────────
router.get('/issues', authenticate, requireValidBranch, async (req, res) => {
  const { status, karigarId, page = 1, limit = 50 } = req.query;
  try {
    let qb = db('tbl_issue_to_karigar as i')
      .leftJoin('tbl_vendor_master as v', 'i.Karigar_ID', 'v.Vendor_ID')
      .where({ 'i.Tenant_ID': req.user.tenantId, 'i.Data_Mode': modeVal(req) })
      .modify((q) => withBranch(q, req, 'i.Branch_ID'))
      .select('i.*', 'v.Vendor_Name as Karigar_Name');

    if (status) qb = qb.where('i.Status', status);
    if (karigarId) qb = qb.where('i.Karigar_ID', karigarId);

    const [{ count }] = await withBranch(db('tbl_issue_to_karigar')
      .where({ Tenant_ID: req.user.tenantId, Data_Mode: modeVal(req) }), req)
      .count('Issue_ID as count').first().then(r => [r]);
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const data = await qb.orderBy('i.Issue_Date', 'desc').limit(parseInt(limit)).offset(offset);

    return sendSuccess(res, { items: data, total: parseInt(count), page: parseInt(page) });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch issues.');
  }
});

// ─── POST /api/karigar/return ─────────────────────────────────────────────────
router.post('/return', authenticate, requirePermission('karigar_management'), [
  body('Issue_ID').isInt().withMessage('Issue ID required'),
  body('Gross_Weight_Returned').isFloat({ min: 0.001 }).withMessage('Return weight required'),
  body('Net_Gold_Weight').isFloat({ min: 0.001 }).withMessage('Net gold weight required'),
  body('Return_Date').isISO8601().withMessage('Return date required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  try {
    const tenantId = req.user.tenantId;
    const returnNumber = await generateReturnNumber(tenantId);

    // Tenant_ID was missing from this lookup entirely — any authenticated
    // user of ANY tenant could previously return gold against another
    // tenant's issue record just by guessing/incrementing Issue_ID. Found
    // and fixed alongside adding branch inheritance below.
    const issue = await db('tbl_issue_to_karigar').where({ Issue_ID: req.body.Issue_ID, Tenant_ID: tenantId }).first();
    if (!issue) return sendError(res, 404, 'Issue record not found.');
    if (issue.Status === 'Completed') return sendError(res, 400, 'This issue is already fully reconciled — nothing left to return.');

    const returnedWeight = parseFloat(req.body.Gross_Weight_Returned);
    const wastageWeight = parseFloat(req.body.Wastage_Weight || 0);
    const wastagePercent = issue.Gold_Weight_Issued > 0 ? (wastageWeight / issue.Gold_Weight_Issued) * 100 : 0;
    const goldRateAtReturn = parseFloat(req.body.Gold_Rate_At_Return || issue.Gold_Rate_At_Issue);
    const totalValueReturned = returnedWeight * goldRateAtReturn;

    // Real gold-weight balance check — nothing previously stopped a return
    // (or a typo, e.g. 50.000 for 5.000) from booking more gold as
    // returned+wasted than was ever issued in the first place, silently
    // inflating both the reconciliation and (before this fix) the wages
    // computed from it.
    const alreadyAccounted = parseFloat(issue.Returned_Weight || 0) + parseFloat(issue.Wastage_Used || 0);
    const remaining = parseFloat(issue.Gold_Weight_Issued) - alreadyAccounted;
    if (returnedWeight + wastageWeight > remaining + 0.001) {
      return sendError(res, 400, `Return + wastage (${(returnedWeight + wastageWeight).toFixed(3)}g) exceeds what's still outstanding on this issue (${remaining.toFixed(3)}g).`);
    }

    const [returnRecord] = await db('tbl_return_from_karigar').insert({
      ...req.body,
      Tenant_ID: tenantId,
      // Multi-Branch Management — inherits the PARENT issue's branch
      // rather than the caller's active context: gold returns to whatever
      // branch it was actually issued from, not wherever the person
      // processing the return happens to be working today.
      Branch_ID: issue.Branch_ID,
      Return_Number: returnNumber,
      Wastage_Percentage_Applied: wastagePercent,
      Total_Value_Returned: totalValueReturned,
      Created_By: req.user.username,
    }).returning('*');

    // Update issue status — reconciles against returned + wastage, not
    // returned alone. Legitimate wastage means returned weight is ALWAYS
    // less than issued, so the old `returned >= issued` check meant every
    // karigar job with any wastage at all could never reach Completed.
    const newReturnedWeight = round2(parseFloat(issue.Returned_Weight || 0) + returnedWeight);
    const newWastageUsed = round2(parseFloat(issue.Wastage_Used || 0) + wastageWeight);
    const newStatus = (newReturnedWeight + newWastageUsed) >= parseFloat(issue.Gold_Weight_Issued) - 0.001 ? 'Completed' : 'Partial';
    // Whatever's left unaccounted once this issue is fully reconciled —
    // Missing_Weight/Missing_Value existed on the schema and were rendered
    // on the Karigar Report, but no route ever wrote them; gold a karigar
    // simply never returned was permanently invisible.
    const missingWeight = newStatus === 'Completed' ? Math.max(0, round2(parseFloat(issue.Gold_Weight_Issued) - newReturnedWeight - newWastageUsed)) : 0;

    await db('tbl_issue_to_karigar').where({ Issue_ID: req.body.Issue_ID }).update({
      Returned_Weight: newReturnedWeight,
      Wastage_Used: newWastageUsed,
      Missing_Weight: missingWeight,
      Missing_Value: round2(missingWeight * goldRateAtReturn),
      Return_Date: req.body.Return_Date,
      Status: newStatus,
      Modified_Date: new Date(),
    });

    // Gold physically coming back had zero ledger impact, mirroring the
    // issue-side gap above — Cr "Gold with Karigar" for the value that's
    // no longer with them (returned + wastage), Dr Gold Stock for what
    // physically came back, Dr Wastage Expense for the rupee value of
    // metal that didn't (a real cost of doing business with karigars, not
    // something either sitting in stock or still owed).
    const wastageValue = round2(wastageWeight * goldRateAtReturn);
    const journalLines = [
      { account: 'Gold with Karigar Account', group: 'Assets', sub: 'Inventory', type: 'Cr', amount: round2(totalValueReturned + wastageValue), narration: `Returned | ${returnNumber}` },
    ];
    if (totalValueReturned >= 0.01) journalLines.push({ account: 'Gold Stock Account', group: 'Assets', sub: 'Inventory', type: 'Dr', amount: round2(totalValueReturned), narration: `Returned | ${returnNumber}` });
    if (wastageValue >= 0.01) journalLines.push({ account: 'Karigar Wastage Expense Account', group: 'Expenses', sub: 'Direct Expense', type: 'Dr', amount: wastageValue, narration: `Wastage | ${returnNumber}` });
    await postJournal({
      tenantId, sourceType: 'JOURNAL', sourceId: returnRecord.Return_ID, reference: `KARIGAR-RETURN-${returnNumber}`, branchId: issue.Branch_ID,
      narration: `Gold returned from karigar — ${returnNumber}`, createdBy: req.user.username, dataMode: modeVal(req),
      lines: journalLines,
    }).catch((e) => console.error('[Karigar] Return ledger post failed (return still recorded fine):', e.message));

    return sendSuccess(res, returnRecord, 'Return recorded successfully.', 201);
  } catch (err) {
    console.error('Return error:', err);
    return sendError(res, 500, 'Failed to record return.');
  }
});

// ─── GET /api/karigar/settlement ──────────────────────────────────────────────
// Shared by the GET preview below and POST /settle itself, so what's
// PAID is always computed by the exact same logic as what was SHOWN —
// POST /settle never trusts a client-supplied amount.
//
// Wastage used to be deducted from wages at the WAGES rate (₹/g of
// making charge) instead of the GOLD rate — wastage is grams of metal
// lost, so charging it at the labor rate under-recovered by roughly two
// orders of magnitude. Wastage_Allowed_Percent was also captured and
// shown on screen ("wastage over the allowance is deducted") but never
// actually enforced — 100% of wastage was deducted, allowance or not.
// Only settleable=true rows (unsettled, reconciled Completed issues) are
// eligible — Partial issues aren't settled piecemeal, and an already-
// Is_Settled issue never appears again.
async function computeKarigarSettlement(req, karigarId, fromDate, toDate) {
  let qb = db('tbl_issue_to_karigar as i')
    .join('tbl_return_from_karigar as r', 'i.Issue_ID', 'r.Issue_ID')
    .join('tbl_vendor_master as k', 'i.Karigar_ID', 'k.Vendor_ID')
    .where('i.Tenant_ID', req.user.tenantId)
    .where('i.Data_Mode', modeVal(req))
    .where('i.Karigar_ID', karigarId)
    .where('i.Is_Settled', false)
    .where('i.Status', 'Completed')
    .whereBetween('r.Return_Date', [fromDate, toDate]);
  qb = withBranch(qb, req, 'i.Branch_ID');
  const rows = await qb
    .select(
      'k.Vendor_Name as Karigar_Name', 'k.Vendor_Code as Karigar_Code',
      'i.Issue_ID', 'i.Issue_Date', 'i.Issue_Number', 'i.Gold_Weight_Issued',
      'i.Wastage_Allowed_Percent', 'i.Karigar_Wages_Rate',
      'r.Gross_Weight_Returned', 'r.Wastage_Weight', 'r.Gold_Rate_At_Return', 'r.Return_Date'
    )
    .orderBy('i.Issue_Date');

  // One issue can have multiple return rows (partial returns building up
  // to Completed) — group by Issue_ID so wages/wastage-allowance are
  // computed once per issue, against its TOTAL wastage, not double-counted
  // per return row.
  const byIssue = new Map();
  for (const row of rows) {
    const existing = byIssue.get(row.Issue_ID) || { ...row, Gross_Weight_Returned: 0, Wastage_Weight: 0 };
    existing.Gross_Weight_Returned = round2(existing.Gross_Weight_Returned + parseFloat(row.Gross_Weight_Returned || 0));
    existing.Wastage_Weight = round2(existing.Wastage_Weight + parseFloat(row.Wastage_Weight || 0));
    existing.Gold_Rate_At_Return = row.Gold_Rate_At_Return; // last return's rate
    byIssue.set(row.Issue_ID, existing);
  }

  const items = [];
  const totals = { totalIssued: 0, totalReturned: 0, totalWastage: 0, grossWages: 0, wastageDeduction: 0, netWages: 0 };
  for (const row of byIssue.values()) {
    const issuedWeight = parseFloat(row.Gold_Weight_Issued || 0);
    const returnedWeight = parseFloat(row.Gross_Weight_Returned || 0);
    const wastageWeight = parseFloat(row.Wastage_Weight || 0);
    const allowedWeight = issuedWeight * (parseFloat(row.Wastage_Allowed_Percent || 0) / 100);
    const deductibleWastageWeight = Math.max(0, round2(wastageWeight - allowedWeight));
    const goldRate = parseFloat(row.Gold_Rate_At_Return || 0);
    const wagesRate = parseFloat(row.Karigar_Wages_Rate || 0);

    const grossWages = round2(returnedWeight * wagesRate);
    const wastageDeduction = round2(deductibleWastageWeight * goldRate);
    const netWages = round2(grossWages - wastageDeduction);

    items.push({ ...row, Gross_Weight_Returned: returnedWeight, Wastage_Weight: wastageWeight, Deductible_Wastage_Weight: deductibleWastageWeight, Gross_Wages: grossWages, Wastage_Deduction: wastageDeduction, Net_Wages: netWages });
    totals.totalIssued = round2(totals.totalIssued + issuedWeight);
    totals.totalReturned = round2(totals.totalReturned + returnedWeight);
    totals.totalWastage = round2(totals.totalWastage + wastageWeight);
    totals.grossWages = round2(totals.grossWages + grossWages);
    totals.wastageDeduction = round2(totals.wastageDeduction + wastageDeduction);
    totals.netWages = round2(totals.netWages + netWages);
  }
  return { items, totals };
}

router.get('/settlement', authenticate, requireValidBranch, async (req, res) => {
  const { karigarId, fromDate, toDate } = req.query;
  if (!karigarId || !fromDate || !toDate) {
    return sendError(res, 400, 'karigarId, fromDate, toDate are required.');
  }
  try {
    const { items, totals } = await computeKarigarSettlement(req, karigarId, fromDate, toDate);
    return sendSuccess(res, { items, totals });
  } catch (err) {
    console.error('Settlement error:', err);
    return sendError(res, 500, 'Failed to calculate settlement.');
  }
});

// ─── POST /api/karigar/settle ─────────────────────────────────────────────────
// Used to take a client-supplied `amount` on trust, with no record of
// WHICH issues were being paid for — clicking "Mark as Paid" twice
// double-paid and double-posted to the ledger; re-running last month's
// date range next month re-settled the same wages, since nothing was
// ever marked settled. Now: the amount is always recomputed server-side
// from computeKarigarSettlement (the exact same query the preview above
// uses), and every issue included is stamped Is_Settled so it can never
// be settled again by any future date-range query.
// requireValidBranch — computeKarigarSettlement filters by the active
// branch context (same as GET /settlement above, which already had this
// guard); without it here too, a caller could send an X-Branch-ID for a
// branch they have no real access to and settle/pay for its issues.
router.post('/settle', authenticate, requirePermission('karigar_management'), requireValidBranch, async (req, res) => {
  const { karigarId, fromDate, toDate, paymentMode, bankAccountId, remarks } = req.body;
  if (!karigarId || !fromDate || !toDate) return sendError(res, 400, 'karigarId, fromDate, toDate are required.');
  const tenantId = req.user.tenantId;

  try {
    const karigar = await db('tbl_vendor_master').where({ Vendor_ID: karigarId, Tenant_ID: tenantId }).first();
    if (!karigar) return sendError(res, 404, 'Karigar not found.');

    const { items, totals } = await computeKarigarSettlement(req, karigarId, fromDate, toDate);
    if (!items.length || totals.netWages <= 0) {
      return sendError(res, 400, 'Nothing to settle — no unsettled, fully-returned issues in this date range.');
    }
    const amount = totals.netWages;

    await db('tbl_vendor_master')
      .where({ Vendor_ID: karigarId, Tenant_ID: tenantId })
      .update({ Current_Balance: db.raw(`"Current_Balance" - ?`, [amount]) });

    const settledAt = new Date();
    for (const item of items) {
      await db('tbl_issue_to_karigar').where({ Issue_ID: item.Issue_ID })
        .update({ Is_Settled: true, Settled_Date: settledAt, Final_Wages_Paid: item.Net_Wages });
    }

    // This used to ONLY move the karigar's own running balance — a real
    // wage payment (cash/bank actually leaving the business) that never
    // touched the double-entry ledger at all, invisible to Trial
    // Balance, Cash Book, and P&L. Dr the wage expense, Cr wherever the
    // money actually came from.
    const ledger = await resolveLedgerForPayment(db, tenantId, paymentMode || 'Cash', bankAccountId);
    // Awaited — was fire-and-forget, so the response could go out before
    // this journal was guaranteed committed (see sales.js's identical fix
    // for the concrete failure mode this caused).
    // computeKarigarSettlement already filtered its issues by the active
    // branch context (withBranch), so every item here shares the same
    // branch whenever one is active — safe to stamp the settlement
    // journal with it directly (null/'ALL' both correctly fall through
    // to a tenant-wide, unstamped journal, same as everywhere else).
    const settleBranchId = branchVal(req) && branchVal(req) !== 'ALL' ? branchVal(req) : null;
    await postJournal({
      tenantId, sourceType: 'JOURNAL', reference: `KARIGAR-SETTLE-${karigarId}-${Date.now()}`, branchId: settleBranchId,
      narration: `Karigar wages settled — ${karigar.Vendor_Name} (${items.length} issue${items.length !== 1 ? 's' : ''})${remarks ? ' | ' + remarks : ''}`, createdBy: req.user.username,
      lines: [
        { account: 'Making Charges Paid to Karigar Account', group: 'Expenses', sub: 'Direct Expense', type: 'Dr', amount },
        { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Cr', amount },
      ],
    }).catch((e) => console.error('[Karigar] Settlement ledger post failed (settlement still recorded fine):', e.message));

    return sendSuccess(res, { amount, issuesSettled: items.length }, 'Settlement processed successfully.');
  } catch (err) {
    console.error('Settle error:', err);
    return sendError(res, 500, 'Settlement failed.');
  }
});

// ─── Vendor CRUD (for both Karigars and Suppliers) ────────────────────────────
// Vendor_ID/tbl_vendor_master is the one shared master behind both the
// Karigar and Purchase modules (Vendor_Type: Karigar/Supplier/Both) — a
// user who manages either can create/edit/deactivate a vendor record.
const requireVendorManagePermission = (req, res, next) => {
  const p = req.user?.permissions || {};
  if (p.karigar_management || p.inventory) return next();
  return sendError(res, 403, "Access denied. Required permission: 'karigar_management' or 'inventory'.");
};

// Fields a caller may set on a vendor — excludes Vendor_ID/Tenant_ID/Vendor_Code/
// Current_Balance/Created_By/Created_Date (system-managed) so a client can't
// smuggle a balance change or hop tenants through this route.
const VENDOR_EDITABLE_FIELDS = [
  'Vendor_Name', 'Vendor_Type', 'Contact_Person', 'Mobile_1', 'Mobile_2', 'Email',
  'Address_Line1', 'Address_Line2', 'City', 'State', 'Pincode', 'GST_No', 'PAN_No',
  'Bank_Name', 'Bank_Account_No', 'IFSC_Code', 'Credit_Limit', 'Credit_Days',
  'Karigar_Skill', 'Karigar_Experience_Years', 'Karigar_Daily_Capacity',
  'Karigar_Wastage_Allowed_Percent', 'Notes',
];
function pickVendorFields(body) {
  const out = {};
  for (const f of VENDOR_EDITABLE_FIELDS) if (body[f] !== undefined) out[f] = body[f];
  return out;
}

router.post('/vendor', authenticate, requireVendorManagePermission, [
  body('Vendor_Name').trim().notEmpty(),
  // 'Dealer' added for the Dealer Transaction module — dealer-to-dealer
  // trades of finished/semi-finished goods are a real, distinct
  // relationship from Supplier (who sells raw stock) or Karigar (who
  // works gold for a making charge), so it gets its own type rather than
  // overloading one of those.
  body('Vendor_Type').isIn(['Supplier', 'Karigar', 'Both', 'Dealer']),
  body('Mobile_1').trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  try {
    const tenantId = req.user.tenantId;
    const count = await db('tbl_vendor_master').where({ Tenant_ID: tenantId }).count('Vendor_ID as c').first();
    const vendorCode = `VND-${tenantId.replace('_', '')}-${String(parseInt(count.c) + 1).padStart(4, '0')}`;

    const [vendor] = await db('tbl_vendor_master').insert({
      ...pickVendorFields(req.body),
      Opening_Balance: req.body.Opening_Balance || 0,
      Current_Balance: req.body.Opening_Balance || 0,
      Tenant_ID: tenantId,
      Vendor_Code: vendorCode,
      Created_By: req.user.username,
    }).returning('*');

    return sendSuccess(res, vendor, 'Vendor added successfully.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Vendor code already exists.');
    return sendError(res, 500, 'Failed to add vendor.');
  }
});

router.get('/vendors', authenticate, async (req, res) => {
  const { type, includeInactive } = req.query;
  try {
    let qb = db('tbl_vendor_master').where({ Tenant_ID: req.user.tenantId });
    if (!includeInactive || includeInactive === 'false') qb = qb.where({ Is_Active: true });
    if (type) qb = qb.whereIn('Vendor_Type', [type, 'Both']);
    const vendors = await qb.orderBy('Vendor_Name');
    return sendSuccess(res, vendors);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch vendors.');
  }
});

// ─── PUT /api/karigar/vendor/:id ───────────────────────────────────────────────
// Was entirely missing — a karigar/supplier's mobile, GSTIN, address, wastage
// allowance, or bank details could be set once at creation and never
// corrected or updated through the app.
router.put('/vendor/:id', authenticate, requireVendorManagePermission, async (req, res) => {
  try {
    const existing = await db('tbl_vendor_master').where({ Vendor_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!existing) return sendError(res, 404, 'Vendor not found.');

    const updates = pickVendorFields(req.body);
    if (Object.keys(updates).length === 0) return sendError(res, 400, 'No editable fields provided.');
    updates.Modified_Date = new Date();

    const [vendor] = await db('tbl_vendor_master').where({ Vendor_ID: req.params.id }).update(updates).returning('*');
    return sendSuccess(res, vendor, 'Vendor updated.');
  } catch (err) {
    return sendError(res, 500, 'Failed to update vendor.');
  }
});

// ─── PATCH /api/karigar/vendor/:id/deactivate & /reactivate ───────────────────
// Also entirely missing — a vendor could be created but never retired, so a
// karigar who left or a supplier the business stopped dealing with stayed
// in every dropdown forever with no way to hide them.
router.patch('/vendor/:id/deactivate', authenticate, requireVendorManagePermission, async (req, res) => {
  try {
    const existing = await db('tbl_vendor_master').where({ Vendor_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!existing) return sendError(res, 404, 'Vendor not found.');
    if (parseFloat(existing.Current_Balance) !== 0) {
      return sendError(res, 400, `Cannot deactivate — outstanding balance of ₹${existing.Current_Balance}. Settle it first.`);
    }
    const openIssue = await db('tbl_issue_to_karigar').where({ Karigar_ID: req.params.id, Tenant_ID: req.user.tenantId }).whereNot('Status', 'Completed').first();
    if (openIssue) return sendError(res, 400, `Cannot deactivate — issue ${openIssue.Issue_Number} is still open with this karigar.`);

    const [vendor] = await db('tbl_vendor_master').where({ Vendor_ID: req.params.id }).update({ Is_Active: false, Modified_Date: new Date() }).returning('*');
    return sendSuccess(res, vendor, 'Vendor deactivated.');
  } catch (err) {
    return sendError(res, 500, 'Failed to deactivate vendor.');
  }
});

router.patch('/vendor/:id/reactivate', authenticate, requireVendorManagePermission, async (req, res) => {
  try {
    const existing = await db('tbl_vendor_master').where({ Vendor_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!existing) return sendError(res, 404, 'Vendor not found.');
    const [vendor] = await db('tbl_vendor_master').where({ Vendor_ID: req.params.id }).update({ Is_Active: true, Modified_Date: new Date() }).returning('*');
    return sendSuccess(res, vendor, 'Vendor reactivated.');
  } catch (err) {
    return sendError(res, 500, 'Failed to reactivate vendor.');
  }
});

// ─── GET /api/karigar/outstanding ──────────────────────────────────────────────
// Karigar-summary (below) only ever reported issued vs. returned weight —
// there was no money-based "who do I owe wages to, and how much" view,
// unlike Customer Reports' outstanding tab. Aggregates every open
// (Is_Settled=false, Status='Completed') issue's estimated wages, plus any
// still-open (not yet Completed) issue's gold-with-karigar value, per karigar.
router.get('/outstanding', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const rows = await db('tbl_vendor_master as v')
      .where('v.Tenant_ID', tenantId)
      .whereIn('v.Vendor_Type', ['Karigar', 'Both'])
      .leftJoin('tbl_issue_to_karigar as i', function () {
        this.on('i.Karigar_ID', 'v.Vendor_ID').andOn('i.Tenant_ID', db.raw('?', [tenantId]));
      })
      .groupBy('v.Vendor_ID', 'v.Vendor_Name', 'v.Vendor_Code', 'v.Mobile_1', 'v.Current_Balance')
      .select(
        'v.Vendor_ID', 'v.Vendor_Name', 'v.Vendor_Code', 'v.Mobile_1', 'v.Current_Balance',
        db.raw(`COALESCE(SUM(CASE WHEN i."Status" != 'Completed' THEN i."Total_Value_Issued" ELSE 0 END), 0) as gold_with_karigar_value`),
        db.raw(`COALESCE(SUM(CASE WHEN i."Is_Settled" = false AND i."Status" = 'Completed' THEN i."Estimated_Wages" ELSE 0 END), 0) as wages_payable`),
        db.raw(`COUNT(CASE WHEN i."Status" != 'Completed' THEN 1 END) as open_issues`),
        db.raw(`COUNT(CASE WHEN i."Is_Settled" = false AND i."Status" = 'Completed' THEN 1 END) as unsettled_completed_issues`)
      )
      .orderBy('wages_payable', 'desc');
    return sendSuccess(res, rows);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch karigar outstanding summary.');
  }
});

module.exports = router;
