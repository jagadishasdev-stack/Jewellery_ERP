const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');
const { generateIssueNumber, generateReturnNumber } = require('../utils/invoiceNumber');
const { auditLog } = require('../utils/auditLogger');
const { modeVal } = require('../utils/dataModeFilter');
const { requireValidBranch, withBranch, resolveBranchForInsert } = require('../utils/branchAccess');
const { postJournal } = require('../utils/accountingEngine');
const { resolveLedgerForPayment } = require('../utils/paymentLedgerMap');

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

    const issue = await db('tbl_issue_to_karigar').where({ Issue_ID: req.body.Issue_ID }).first();
    if (!issue) return sendError(res, 404, 'Issue record not found.');

    const returnedWeight = parseFloat(req.body.Gross_Weight_Returned);
    const wastageWeight = parseFloat(req.body.Wastage_Weight || 0);
    const wastagePercent = issue.Gold_Weight_Issued > 0 ? (wastageWeight / issue.Gold_Weight_Issued) * 100 : 0;
    const goldRateAtReturn = parseFloat(req.body.Gold_Rate_At_Return || issue.Gold_Rate_At_Issue);
    const totalValueReturned = returnedWeight * goldRateAtReturn;

    const [returnRecord] = await db('tbl_return_from_karigar').insert({
      ...req.body,
      Tenant_ID: tenantId,
      Return_Number: returnNumber,
      Wastage_Percentage_Applied: wastagePercent,
      Total_Value_Returned: totalValueReturned,
      Created_By: req.user.username,
    }).returning('*');

    // Update issue status
    const newReturnedWeight = parseFloat(issue.Returned_Weight || 0) + returnedWeight;
    const newStatus = newReturnedWeight >= issue.Gold_Weight_Issued ? 'Completed' : 'Partial';

    await db('tbl_issue_to_karigar').where({ Issue_ID: req.body.Issue_ID }).update({
      Returned_Weight: newReturnedWeight,
      Wastage_Used: parseFloat(issue.Wastage_Used || 0) + wastageWeight,
      Return_Date: req.body.Return_Date,
      Status: newStatus,
      Modified_Date: new Date(),
    });

    return sendSuccess(res, returnRecord, 'Return recorded successfully.', 201);
  } catch (err) {
    console.error('Return error:', err);
    return sendError(res, 500, 'Failed to record return.');
  }
});

// ─── GET /api/karigar/settlement ──────────────────────────────────────────────
router.get('/settlement', authenticate, async (req, res) => {
  const { karigarId, fromDate, toDate } = req.query;
  if (!karigarId || !fromDate || !toDate) {
    return sendError(res, 400, 'karigarId, fromDate, toDate are required.');
  }

  try {
    const settlement = await db('tbl_issue_to_karigar as i')
      .join('tbl_return_from_karigar as r', 'i.Issue_ID', 'r.Issue_ID')
      .join('tbl_vendor_master as k', 'i.Karigar_ID', 'k.Vendor_ID')
      .where('i.Tenant_ID', req.user.tenantId)
      .where('i.Data_Mode', modeVal(req))
      .where('i.Karigar_ID', karigarId)
      .whereBetween('r.Return_Date', [fromDate, toDate])
      .select(
        'k.Vendor_Name as Karigar_Name',
        'k.Vendor_Code as Karigar_Code',
        'i.Issue_Date',
        'i.Issue_Number',
        'i.Gold_Weight_Issued',
        'i.Gold_Rate_At_Issue',
        'i.Karigar_Wages_Rate',
        'r.Gross_Weight_Returned',
        'r.Wastage_Weight',
        'r.Return_Date'
      )
      .orderBy('i.Issue_Date');

    // Calculate totals
    const totals = settlement.reduce((acc, row) => {
      acc.totalIssued += parseFloat(row.Gold_Weight_Issued || 0);
      acc.totalReturned += parseFloat(row.Gross_Weight_Returned || 0);
      acc.totalWastage += parseFloat(row.Wastage_Weight || 0);
      const grossWages = parseFloat(row.Gross_Weight_Returned || 0) * parseFloat(row.Karigar_Wages_Rate || 0);
      const wastageDeduction = parseFloat(row.Wastage_Weight || 0) * parseFloat(row.Karigar_Wages_Rate || 0);
      acc.grossWages += grossWages;
      acc.wastageDeduction += wastageDeduction;
      acc.netWages += (grossWages - wastageDeduction);
      return acc;
    }, { totalIssued: 0, totalReturned: 0, totalWastage: 0, grossWages: 0, wastageDeduction: 0, netWages: 0 });

    return sendSuccess(res, { items: settlement, totals });
  } catch (err) {
    console.error('Settlement error:', err);
    return sendError(res, 500, 'Failed to calculate settlement.');
  }
});

// ─── POST /api/karigar/settle ─────────────────────────────────────────────────
router.post('/settle', authenticate, requirePermission('karigar_management'), async (req, res) => {
  const { karigarId, amount, paymentMode, bankAccountId, remarks } = req.body;
  if (!karigarId || !amount) return sendError(res, 400, 'Karigar ID and amount required.');
  const tenantId = req.user.tenantId;

  try {
    const karigar = await db('tbl_vendor_master').where({ Vendor_ID: karigarId, Tenant_ID: tenantId }).first();
    if (!karigar) return sendError(res, 404, 'Karigar not found.');

    await db('tbl_vendor_master')
      .where({ Vendor_ID: karigarId, Tenant_ID: tenantId })
      .update({ Current_Balance: db.raw(`"Current_Balance" - ?`, [parseFloat(amount)]) });

    // This used to ONLY move the karigar's own running balance — a real
    // wage payment (cash/bank actually leaving the business) that never
    // touched the double-entry ledger at all, invisible to Trial
    // Balance, Cash Book, and P&L. Dr the wage expense, Cr wherever the
    // money actually came from.
    const ledger = await resolveLedgerForPayment(db, tenantId, paymentMode || 'Cash', bankAccountId);
    // Awaited — was fire-and-forget, so the response could go out before
    // this journal was guaranteed committed (see sales.js's identical fix
    // for the concrete failure mode this caused).
    await postJournal({
      tenantId, sourceType: 'JOURNAL', reference: `KARIGAR-SETTLE-${karigarId}-${Date.now()}`,
      narration: `Karigar wages settled — ${karigar.Vendor_Name}${remarks ? ' | ' + remarks : ''}`, createdBy: req.user.username,
      lines: [
        { account: 'Making Charges Paid to Karigar Account', group: 'Expenses', sub: 'Direct Expense', type: 'Dr', amount: parseFloat(amount) },
        { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Cr', amount: parseFloat(amount) },
      ],
    }).catch((e) => console.error('[Karigar] Settlement ledger post failed (settlement still recorded fine):', e.message));

    return sendSuccess(res, null, 'Settlement processed successfully.');
  } catch (err) {
    return sendError(res, 500, 'Settlement failed.');
  }
});

// ─── Vendor CRUD (for both Karigars and Suppliers) ────────────────────────────
router.post('/vendor', authenticate, [
  body('Vendor_Name').trim().notEmpty(),
  body('Vendor_Type').isIn(['Supplier', 'Karigar', 'Both']),
  body('Mobile_1').trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  try {
    const tenantId = req.user.tenantId;
    const count = await db('tbl_vendor_master').where({ Tenant_ID: tenantId }).count('Vendor_ID as c').first();
    const vendorCode = `VND-${tenantId.replace('_', '')}-${String(parseInt(count.c) + 1).padStart(4, '0')}`;

    const [vendor] = await db('tbl_vendor_master').insert({
      ...req.body,
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
  const { type } = req.query;
  try {
    let qb = db('tbl_vendor_master').where({ Tenant_ID: req.user.tenantId, Is_Active: true });
    if (type) qb = qb.whereIn('Vendor_Type', [type, 'Both']);
    const vendors = await qb.orderBy('Vendor_Name');
    return sendSuccess(res, vendors);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch vendors.');
  }
});

module.exports = router;
