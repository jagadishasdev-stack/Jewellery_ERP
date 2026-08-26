const router = require('express').Router();
const { requireModuleAccess } = require('../utils/moduleOverride');
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../utils/auditLogger');
const dayjs = require('dayjs');

// ── Insurance Policy Master ───────────────────────────────────────────────────
router.get('/policies', authenticate, requireModuleAccess('insurance_amc', 'View'), async (req, res) => {
  try {
    const rows = await db('tbl_insurance_policy_master').where('Tenant_ID', req.user.tenantId).where('Is_Active', true);
    return sendSuccess(res, rows);
  } catch (err) { return sendError(res, 500, 'Failed to fetch policies.'); }
});

router.post('/policies', authenticate, requireModuleAccess('insurance_amc', 'Add'), [body('Insurer_Name').notEmpty(), body('Policy_Number').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_insurance_policy_master').insert({ ...req.body, Tenant_ID: req.user.tenantId, Created_By: req.user.username }).returning('*');
    return sendSuccess(res, row, 'Policy created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create policy.'); }
});

// ── Customer Insurance ────────────────────────────────────────────────────────
router.get('/customer-insurance', authenticate, requireModuleAccess('insurance_amc', 'View'), async (req, res) => {
  const { customerId, status } = req.query;
  try {
    let qb = db('tbl_customer_insurance as i')
      .leftJoin('tbl_customer_master as c', 'i.Customer_ID', 'c.Customer_ID')
      .leftJoin('tbl_insurance_policy_master as p', 'i.Policy_ID', 'p.Policy_ID')
      .where('i.Tenant_ID', req.user.tenantId)
      .select('i.*', 'c.Customer_Name', 'p.Insurer_Name');
    if (customerId) qb = qb.where('i.Customer_ID', customerId);
    if (status) qb = qb.where('i.Status', status);
    return sendSuccess(res, await qb.orderBy('i.Insurance_ID', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch customer insurance.'); }
});

router.post('/customer-insurance', authenticate, requireModuleAccess('insurance_amc', 'Add'), [
  body('Customer_ID').notEmpty(),
  body('Sum_Insured').isFloat({ gt: 0 }),
  body('Start_Date').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const policy = req.body.Policy_ID ? await db('tbl_insurance_policy_master').where('Policy_ID', req.body.Policy_ID).first() : null;
    const premium = req.body.Premium_Amount ?? (policy?.Premium_Rate_Pct ? (req.body.Sum_Insured * policy.Premium_Rate_Pct) / 100 : 0);
    const [row] = await db('tbl_customer_insurance').insert({
      ...req.body, Tenant_ID: req.user.tenantId, Premium_Amount: premium,
      Expiry_Date: req.body.Expiry_Date || dayjs(req.body.Start_Date).add(1, 'year').format('YYYY-MM-DD'),
      Status: 'Active', Created_By: req.user.username,
    }).returning('*');
    await auditLog({ tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_customer_insurance', recordId: row.Insurance_ID, actionType: 'INSERT', newData: row, description: `Insurance enrolled for customer ${row.Customer_ID}`, req });
    return sendSuccess(res, row, 'Customer insurance created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create customer insurance.'); }
});

router.post('/customer-insurance/:id/claim', authenticate, requireModuleAccess('insurance_amc', 'Approve'), [body('Claim_Amount').isFloat({ gt: 0 })], async (req, res) => {
  try {
    const [row] = await db('tbl_customer_insurance').where({ Insurance_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: 'Claimed', Claim_Date: dayjs().format('YYYY-MM-DD'), Claim_Amount: req.body.Claim_Amount }).returning('*');
    if (!row) return sendError(res, 404, 'Not found.');
    return sendSuccess(res, row, 'Claim recorded.');
  } catch (err) { return sendError(res, 500, 'Failed to record claim.'); }
});

// ── AMC Plan Master ────────────────────────────────────────────────────────────
router.get('/amc-plans', authenticate, requireModuleAccess('insurance_amc', 'View'), async (req, res) => {
  try { return sendSuccess(res, await db('tbl_amc_plan_master').where('Tenant_ID', req.user.tenantId).where('Is_Active', true)); }
  catch (err) { return sendError(res, 500, 'Failed to fetch AMC plans.'); }
});

router.post('/amc-plans', authenticate, requireModuleAccess('insurance_amc', 'Add'), [body('Plan_Name').notEmpty(), body('Amount').isFloat({ gt: 0 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_amc_plan_master').insert({ ...req.body, Tenant_ID: req.user.tenantId, Created_By: req.user.username }).returning('*');
    return sendSuccess(res, row, 'AMC plan created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create AMC plan.'); }
});

// ── AMC Enrollment ─────────────────────────────────────────────────────────────
router.get('/amc-enrollments', authenticate, requireModuleAccess('insurance_amc', 'View'), async (req, res) => {
  const { customerId, status } = req.query;
  try {
    let qb = db('tbl_amc_enrollment as e')
      .leftJoin('tbl_customer_master as c', 'e.Customer_ID', 'c.Customer_ID')
      .leftJoin('tbl_amc_plan_master as p', 'e.Plan_ID', 'p.Plan_ID')
      .where('e.Tenant_ID', req.user.tenantId)
      .select('e.*', 'c.Customer_Name', 'p.Plan_Name', 'p.Free_Services_Included');
    if (customerId) qb = qb.where('e.Customer_ID', customerId);
    if (status) qb = qb.where('e.Status', status);
    return sendSuccess(res, await qb.orderBy('e.Enrollment_ID', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch AMC enrollments.'); }
});

router.post('/amc-enrollments', authenticate, requireModuleAccess('insurance_amc', 'Add'), [body('Customer_ID').notEmpty(), body('Plan_ID').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const plan = await db('tbl_amc_plan_master').where('Plan_ID', req.body.Plan_ID).first();
    if (!plan) return sendError(res, 404, 'AMC plan not found.');
    const startDate = req.body.Start_Date || dayjs().format('YYYY-MM-DD');
    const [row] = await db('tbl_amc_enrollment').insert({
      ...req.body, Tenant_ID: req.user.tenantId, Start_Date: startDate,
      Expiry_Date: dayjs(startDate).add(plan.Duration_Months, 'month').format('YYYY-MM-DD'),
      Amount_Paid: req.body.Amount_Paid ?? plan.Amount, Status: 'Active', Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, row, 'AMC enrollment created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create AMC enrollment.'); }
});

// ── POST /api/insurance-amc/amc-enrollments/:id/service ───────────────────────
// Logs one AMC service visit (cleaning/polish/re-plating) against the plan's
// free-services allowance.
router.post('/amc-enrollments/:id/service', authenticate, requireModuleAccess('insurance_amc', 'Edit'), async (req, res) => {
  try {
    const enrollment = await db('tbl_amc_enrollment').where({ Enrollment_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!enrollment) return sendError(res, 404, 'Enrollment not found.');
    if (enrollment.Status !== 'Active') return sendError(res, 400, `Enrollment is ${enrollment.Status}.`);
    const [row] = await db('tbl_amc_enrollment').where('Enrollment_ID', enrollment.Enrollment_ID)
      .update({ Last_Service_Date: dayjs().format('YYYY-MM-DD'), Services_Used: (enrollment.Services_Used || 0) + 1 }).returning('*');
    return sendSuccess(res, row, 'Service logged.');
  } catch (err) { return sendError(res, 500, 'Failed to log service.'); }
});

module.exports = router;
