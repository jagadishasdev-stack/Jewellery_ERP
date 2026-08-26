const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../utils/auditLogger');
const { postJournal } = require('../utils/accountingEngine');
const { resolveLedgerForPayment } = require('../utils/paymentLedgerMap');
const dayjs = require('dayjs');
const { requireValidBranch, withBranch, resolveBranchForInsert } = require('../utils/branchAccess');

// ── Staff list (for attendance/salary/payroll pickers) ────────────────────────
// No existing route exposed the tenant's staff for a UI dropdown — every
// other module here needs one, so it lives here rather than being
// duplicated per screen.
router.get('/staff', authenticate, async (req, res) => {
  try {
    const rows = await db('tbl_user_master as u')
      .leftJoin('tbl_employee_details as e', 'u.User_ID', 'e.User_ID')
      .where('u.Tenant_ID', req.user.tenantId).where('u.Is_Active', true)
      .select('u.User_ID', 'u.Full_Name', 'u.Department', 'u.Employee_Code', 'e.Designation');
    return sendSuccess(res, rows);
  } catch (err) { return sendError(res, 500, 'Failed to fetch staff.'); }
});

// ── Holiday Master ─────────────────────────────────────────────────────────────
router.get('/holidays', authenticate, async (req, res) => {
  try { return sendSuccess(res, await db('tbl_holiday_master').where('Tenant_ID', req.user.tenantId).orderBy('Holiday_Date')); }
  catch (err) { return sendError(res, 500, 'Failed to fetch holidays.'); }
});

router.post('/holidays', authenticate, [body('Holiday_Date').notEmpty(), body('Holiday_Name').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_holiday_master').insert({ ...req.body, Tenant_ID: req.user.tenantId }).returning('*');
    return sendSuccess(res, row, 'Holiday added.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to add holiday.'); }
});

// ── Attendance ──────────────────────────────────────────────────────────────
router.get('/attendance', authenticate, async (req, res) => {
  const { userId, from, to, date } = req.query;
  try {
    let qb = db('tbl_attendance as a')
      .leftJoin('tbl_user_master as u', 'a.User_ID', 'u.User_ID')
      .where('a.Tenant_ID', req.user.tenantId)
      .select('a.*', 'u.Full_Name');
    if (userId) qb = qb.where('a.User_ID', userId);
    if (date) qb = qb.where('a.Attendance_Date', date);
    if (from) qb = qb.where('a.Attendance_Date', '>=', from);
    if (to) qb = qb.where('a.Attendance_Date', '<=', to);
    return sendSuccess(res, await qb.orderBy('a.Attendance_Date', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch attendance.'); }
});

// Mark/update one day's attendance for one or many staff — upsert on
// (User_ID, Attendance_Date), matching the unique constraint on that table.
router.post('/attendance', authenticate, [body('records').isArray({ min: 1 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const tenantId = req.user.tenantId;
  try {
    const results = [];
    for (const rec of req.body.records) {
      const existing = await db('tbl_attendance').where({ User_ID: rec.User_ID, Attendance_Date: rec.Attendance_Date }).first();
      if (existing) {
        const [row] = await db('tbl_attendance').where('Attendance_ID', existing.Attendance_ID).update({ ...rec, Created_By: req.user.username }).returning('*');
        results.push(row);
      } else {
        const [row] = await db('tbl_attendance').insert({ ...rec, Tenant_ID: tenantId, Created_By: req.user.username }).returning('*');
        results.push(row);
      }
    }
    return sendSuccess(res, results, 'Attendance saved.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to save attendance: ' + err.message); }
});

// ── Salary Structure ───────────────────────────────────────────────────────────
router.get('/salary-structure/:userId', authenticate, async (req, res) => {
  try {
    const row = await db('tbl_salary_structure').where({ User_ID: req.params.userId, Is_Active: true }).orderBy('Effective_From', 'desc').first();
    return sendSuccess(res, row || null);
  } catch (err) { return sendError(res, 500, 'Failed to fetch salary structure.'); }
});

router.post('/salary-structure', authenticate, [body('User_ID').notEmpty(), body('Basic').isFloat({ gt: 0 }), body('Effective_From').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    // Superseding structure — deactivate any previous active one for this user.
    await db('tbl_salary_structure').where({ User_ID: req.body.User_ID, Is_Active: true }).update({ Is_Active: false });
    const [row] = await db('tbl_salary_structure').insert({ ...req.body, Created_By: req.user.username }).returning('*');
    return sendSuccess(res, row, 'Salary structure saved.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to save salary structure.'); }
});

// ── Incentive Slabs ─────────────────────────────────────────────────────────────
router.get('/incentive-slabs', authenticate, async (req, res) => {
  try { return sendSuccess(res, await db('tbl_incentive_slab_master').where('Tenant_ID', req.user.tenantId).where('Is_Active', true).orderBy('Amount_From')); }
  catch (err) { return sendError(res, 500, 'Failed to fetch incentive slabs.'); }
});

router.post('/incentive-slabs', authenticate, [body('Slab_Name').notEmpty(), body('Amount_From').isFloat({ min: 0 }), body('Incentive_Pct').isFloat({ gt: 0 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_incentive_slab_master').insert({ ...req.body, Tenant_ID: req.user.tenantId }).returning('*');
    return sendSuccess(res, row, 'Incentive slab created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create incentive slab.'); }
});

// ── Sales Incentive Transactions ────────────────────────────────────────────────
// Computes the incentive for one sale against the applicable slab and logs
// it — called from the sales flow (or manually here) once a sale is billed.
router.post('/sales-incentive', authenticate, [body('Sale_ID').notEmpty(), body('User_ID').notEmpty(), body('Sale_Base_Amount').isFloat({ gt: 0 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const tenantId = req.user.tenantId;
  try {
    const amount = parseFloat(req.body.Sale_Base_Amount);
    const slab = await db('tbl_incentive_slab_master').where('Tenant_ID', tenantId).where('Is_Active', true)
      .where('Amount_From', '<=', amount)
      .where((qb) => qb.whereNull('Amount_To').orWhere('Amount_To', '>=', amount))
      .orderBy('Amount_From', 'desc').first();
    if (!slab) return sendError(res, 404, 'No incentive slab matches this sale amount.');
    const incentiveAmount = Math.round(((amount * slab.Incentive_Pct) / 100) * 100) / 100;
    const [row] = await db('tbl_sales_incentive_transactions').insert({
      Tenant_ID: tenantId, Sale_ID: req.body.Sale_ID, User_ID: req.body.User_ID, Slab_ID: slab.Slab_ID,
      Sale_Base_Amount: amount, Incentive_Pct_Applied: slab.Incentive_Pct, Incentive_Amount: incentiveAmount,
    }).returning('*');
    return sendSuccess(res, row, 'Incentive calculated and logged.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to calculate incentive: ' + err.message); }
});

router.get('/sales-incentive', authenticate, async (req, res) => {
  const { userId, payrollRunId } = req.query;
  try {
    let qb = db('tbl_sales_incentive_transactions as si')
      .leftJoin('tbl_sales_header as s', 'si.Sale_ID', 's.Sale_ID')
      .where('si.Tenant_ID', req.user.tenantId)
      .select('si.*', 's.Invoice_Number');
    if (userId) qb = qb.where('si.User_ID', userId);
    if (payrollRunId) qb = qb.where('si.Payroll_Run_ID', payrollRunId);
    else qb = qb.whereNull('si.Payroll_Run_ID'); // default view: not-yet-paid-out incentives
    return sendSuccess(res, await qb.orderBy('si.Created_Date', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch sales incentives.'); }
});

// ── Payroll ─────────────────────────────────────────────────────────────────────
router.get('/payroll/runs', authenticate, requireValidBranch, async (req, res) => {
  try {
    let qb = db('tbl_payroll_run').where('Tenant_ID', req.user.tenantId);
    qb = withBranch(qb, req);
    return sendSuccess(res, await qb.orderBy('Pay_Year', 'desc').orderBy('Pay_Month', 'desc'));
  }
  catch (err) { return sendError(res, 500, 'Failed to fetch payroll runs.'); }
});

router.get('/payroll/runs/:id', authenticate, async (req, res) => {
  try {
    const run = await db('tbl_payroll_run').where({ Run_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!run) return sendError(res, 404, 'Payroll run not found.');
    const details = await db('tbl_payroll_details as d')
      .leftJoin('tbl_user_master as u', 'd.User_ID', 'u.User_ID')
      .where('d.Run_ID', run.Run_ID).select('d.*', 'u.Full_Name');
    return sendSuccess(res, { ...run, details });
  } catch (err) { return sendError(res, 500, 'Failed to fetch payroll run.'); }
});

// POST /api/hr/payroll/runs — compute a full month's payroll for every
// active staff member with a salary structure: attendance-based gross,
// PF/ESI deductions from the structure's percentages, plus any pending
// sales incentives, in one draft run.
router.post('/payroll/runs', authenticate, requireValidBranch, [body('Pay_Month').isInt({ min: 1, max: 12 }), body('Pay_Year').isInt({ min: 2020 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const tenantId = req.user.tenantId;
  const { Pay_Month, Pay_Year } = req.body;
  // Multi-Branch Management — the active branch context wins over an
  // explicit body field, same as every other module (see utils/branchAccess.js).
  const branchId = resolveBranchForInsert(req, req.body.Branch_ID);
  try {
    const existing = await db('tbl_payroll_run').where({ Tenant_ID: tenantId, Branch_ID: branchId, Pay_Month, Pay_Year }).first();
    if (existing) return sendError(res, 409, `Payroll for ${Pay_Month}/${Pay_Year} already exists (Run_ID ${existing.Run_ID}).`);

    const [run] = await db('tbl_payroll_run').insert({
      Tenant_ID: tenantId, Branch_ID: branchId, Pay_Month, Pay_Year, Status: 'Draft', Generated_By: req.user.username,
    }).returning('*');

    const monthStart = dayjs(`${Pay_Year}-${String(Pay_Month).padStart(2, '0')}-01`);
    const monthEnd = monthStart.endOf('month');
    const daysInMonth = monthEnd.date();

    // A branch-scoped run must only pay THAT branch's own staff (their
    // home Branch_ID) — this used to always process every active
    // employee tenant-wide regardless of the run's own Branch_ID, so a
    // "HSR payroll" run would have silently also paid Kanakapura's staff.
    let staffQb = db('tbl_user_master').where('Tenant_ID', tenantId).where('Is_Active', true);
    if (branchId) staffQb = staffQb.where('Branch_ID', branchId);
    const staff = await staffQb;
    const details = [];
    for (const emp of staff) {
      const structure = await db('tbl_salary_structure').where({ User_ID: emp.User_ID, Is_Active: true }).orderBy('Effective_From', 'desc').first();
      if (!structure) continue; // no salary structure defined — skip, don't fabricate a salary

      const [{ count: presentCount }] = await db('tbl_attendance')
        .where('User_ID', emp.User_ID).whereBetween('Attendance_Date', [monthStart.format('YYYY-MM-DD'), monthEnd.format('YYYY-MM-DD')])
        .whereIn('Status', ['Present', 'Half Day']).count('Attendance_ID as count');
      const daysPresent = parseInt(presentCount) || 0;
      const daysAbsent = Math.max(0, daysInMonth - daysPresent);

      const monthlyGrossFull = parseFloat(structure.Basic) + parseFloat(structure.HRA || 0) + parseFloat(structure.Conveyance || 0) + parseFloat(structure.Other_Allowance || 0);
      const grossSalary = Math.round((monthlyGrossFull / daysInMonth) * daysPresent * 100) / 100;
      const pfDeduction = Math.round(((parseFloat(structure.Basic) * (structure.PF_Pct || 0)) / 100) * 100) / 100;
      const esiDeduction = Math.round(((grossSalary * (structure.ESI_Pct || 0)) / 100) * 100) / 100;

      const pendingIncentives = await db('tbl_sales_incentive_transactions').where('User_ID', emp.User_ID).whereNull('Payroll_Run_ID').sum('Incentive_Amount as total');
      const incentiveAmount = parseFloat(pendingIncentives[0]?.total || 0);

      const netSalary = Math.round((grossSalary - pfDeduction - esiDeduction + incentiveAmount) * 100) / 100;

      const [detail] = await db('tbl_payroll_details').insert({
        Run_ID: run.Run_ID, User_ID: emp.User_ID, Days_Present: daysPresent, Days_Absent: daysAbsent,
        Gross_Salary: grossSalary, PF_Deduction: pfDeduction, ESI_Deduction: esiDeduction,
        Incentive_Amount: incentiveAmount, Net_Salary: netSalary,
      }).returning('*');
      details.push(detail);

      if (incentiveAmount > 0) {
        await db('tbl_sales_incentive_transactions').where('User_ID', emp.User_ID).whereNull('Payroll_Run_ID')
          .update({ Payroll_Run_ID: run.Run_ID, Payout_Status: 'Included In Payroll' });
      }
    }

    await auditLog({ tenantId, userId: req.user.userId, tableName: 'tbl_payroll_run', recordId: run.Run_ID, actionType: 'INSERT', newData: run, description: `Payroll run generated for ${Pay_Month}/${Pay_Year}, ${details.length} staff`, req });
    return sendSuccess(res, { ...run, details }, `Payroll computed for ${details.length} staff.`, 201);
  } catch (err) { return sendError(res, 500, 'Failed to generate payroll: ' + err.message); }
});

// This used to just flip Status to 'Finalized' — the actual salary
// money (by far one of the largest recurring expenses a jewellery
// business has) never touched the ledger at all, and every payroll
// detail row's own Payment_Status/Payment_Date/Payment_Mode columns
// (which already existed in the schema) were never set either. The
// frontend's only action on a Draft run is this one "Finalize" button,
// so — matching that single-step UX exactly — finalizing IS paying:
// every staff member's Net_Salary is marked paid here, in one go.
router.post('/payroll/runs/:id/finalize', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    const existing = await db('tbl_payroll_run').where({ Run_ID: req.params.id, Tenant_ID: tenantId }).first();
    if (!existing) return sendError(res, 404, 'Payroll run not found.');
    if (existing.Status === 'Finalized') return sendError(res, 400, 'This payroll run is already finalized.');

    const details = await db('tbl_payroll_details').where({ Run_ID: existing.Run_ID });
    if (!details.length) return sendError(res, 400, 'Nothing to finalize — this run has no staff in it.');

    const paymentMode = req.body.Payment_Mode || 'Cash';
    const paidDate = dayjs().format('YYYY-MM-DD');
    const [run] = await db('tbl_payroll_run').where({ Run_ID: req.params.id, Tenant_ID: tenantId })
      .update({ Status: 'Finalized', Finalized_Date: new Date() }).returning('*');
    await db('tbl_payroll_details').where({ Run_ID: run.Run_ID })
      .update({ Payment_Status: 'Paid', Payment_Date: paidDate, Payment_Mode: paymentMode });

    const totals = details.reduce((acc, d) => ({
      gross: acc.gross + parseFloat(d.Gross_Salary || 0),
      pf: acc.pf + parseFloat(d.PF_Deduction || 0),
      esi: acc.esi + parseFloat(d.ESI_Deduction || 0),
      incentive: acc.incentive + parseFloat(d.Incentive_Amount || 0),
      net: acc.net + parseFloat(d.Net_Salary || 0),
    }), { gross: 0, pf: 0, esi: 0, incentive: 0, net: 0 });

    (async () => {
      const ledger = await resolveLedgerForPayment(db, tenantId, paymentMode, req.body.Bank_Account_ID);
      const lines = [
        { account: 'Salary Account', group: 'Expenses', sub: 'Indirect Expense', type: 'Dr', amount: totals.gross },
      ];
      if (totals.incentive > 0) lines.push({ account: 'Sales Incentive Expense Account', group: 'Expenses', sub: 'Indirect Expense', type: 'Dr', amount: totals.incentive });
      if (totals.pf > 0) lines.push({ account: 'PF Payable Account', group: 'Liabilities', sub: 'Payable', type: 'Cr', amount: totals.pf });
      if (totals.esi > 0) lines.push({ account: 'ESI Payable Account', group: 'Liabilities', sub: 'Payable', type: 'Cr', amount: totals.esi });
      lines.push({ account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Cr', amount: totals.net });
      await postJournal({
        tenantId, sourceType: 'JOURNAL', sourceId: run.Run_ID, reference: `PAYROLL-${run.Pay_Month}-${run.Pay_Year}`,
        narration: `Payroll ${run.Pay_Month}/${run.Pay_Year} — ${details.length} staff`, createdBy: req.user.username, lines,
      });
    })().catch((e) => console.error('[HR] Payroll ledger post failed (payroll still finalized fine):', e.message));

    return sendSuccess(res, run, 'Payroll finalized and paid.');
  } catch (err) { return sendError(res, 500, 'Failed to finalize payroll.'); }
});

module.exports = router;
