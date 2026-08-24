const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const dayjs = require('dayjs');

// ── GET /api/scheme  ──────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const schemes = await db('tbl_saving_scheme_master')
      .where({ Tenant_ID: req.user.tenantId, Is_Active: true });
    return sendSuccess(res, schemes);
  } catch (err) { return sendError(res, 500, 'Failed to fetch schemes.'); }
});

// ── POST /api/scheme  ─────────────────────────────────────────────────────────
router.post('/', authenticate, [
  body('Scheme_Code').notEmpty(),
  body('Scheme_Name').notEmpty(),
  body('Duration_Months').isInt({ min: 1 }),
  body('Monthly_Amount').isFloat({ min: 1 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [scheme] = await db('tbl_saving_scheme_master').insert({
      ...req.body, Tenant_ID: req.user.tenantId, Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, scheme, 'Scheme created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Scheme code already exists.');
    return sendError(res, 500, 'Failed to create scheme.');
  }
});

// ── POST /api/scheme/enroll  ──────────────────────────────────────────────────
router.post('/enroll', authenticate, [
  body('Scheme_ID').isInt(),
  body('Customer_ID').isInt(),
  body('Start_Date').isISO8601(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const trx = await db.transaction();
  try {
    const tenantId = req.user.tenantId;
    const scheme = await trx('tbl_saving_scheme_master').where({ Scheme_ID: req.body.Scheme_ID }).first();
    if (!scheme) { await trx.rollback(); return sendError(res, 404, 'Scheme not found.'); }

    const count = await trx('tbl_saving_scheme_enrollment').where({ Tenant_ID: tenantId }).count('Enrollment_ID as c').first();
    const enrollmentNumber = `ENR-${tenantId.replace('_','')}-${String(parseInt(count.c)+1).padStart(5,'0')}`;
    const startDate = dayjs(req.body.Start_Date);
    const maturityDate = startDate.add(scheme.Duration_Months + scheme.Free_Months, 'month');
    const totalInstallments = scheme.Duration_Months;

    const [enrollment] = await trx('tbl_saving_scheme_enrollment').insert({
      Tenant_ID: tenantId,
      Scheme_ID: req.body.Scheme_ID,
      Customer_ID: req.body.Customer_ID,
      Enrollment_Number: enrollmentNumber,
      Start_Date: req.body.Start_Date,
      Maturity_Date: maturityDate.format('YYYY-MM-DD'),
      Monthly_Amount: scheme.Monthly_Amount,
      Total_Installments: totalInstallments,
      Maturity_Value: scheme.Monthly_Amount * (totalInstallments + scheme.Free_Months),
      Status: 'Active',
      Created_By: req.user.username,
    }).returning('*');

    // Generate installment schedule
    const installments = Array.from({ length: totalInstallments }, (_, i) => ({
      Enrollment_ID: enrollment.Enrollment_ID,
      Tenant_ID: tenantId,
      Installment_No: i + 1,
      Due_Date: startDate.add(i + 1, 'month').format('YYYY-MM-DD'),
      Amount: scheme.Monthly_Amount,
      Status: 'Pending',
      Created_By: req.user.username,
    }));
    await trx('tbl_scheme_installments').insert(installments);

    await trx.commit();
    return sendSuccess(res, { enrollment, installmentsCreated: installments.length }, 'Customer enrolled in scheme.', 201);
  } catch (err) {
    await trx.rollback();
    console.error('Enroll error:', err);
    return sendError(res, 500, 'Failed to enroll.');
  }
});

// ── GET /api/scheme/enrollments  ─────────────────────────────────────────────
router.get('/enrollments', authenticate, async (req, res) => {
  const { customerId, status } = req.query;
  try {
    let qb = db('tbl_saving_scheme_enrollment as e')
      .leftJoin('tbl_customer_master as c', 'e.Customer_ID', 'c.Customer_ID')
      .leftJoin('tbl_saving_scheme_master as s', 'e.Scheme_ID', 's.Scheme_ID')
      .where('e.Tenant_ID', req.user.tenantId)
      .select('e.*', 'c.Customer_Name', 'c.Mobile_1', 's.Scheme_Name');
    if (customerId) qb = qb.where('e.Customer_ID', customerId);
    if (status) qb = qb.where('e.Status', status);
    return sendSuccess(res, await qb.orderBy('e.Created_Date', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch enrollments.'); }
});

// ── POST /api/scheme/pay-installment  ────────────────────────────────────────
router.post('/pay-installment', authenticate, [
  body('Installment_ID').isInt(),
  body('Payment_Mode').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const trx = await db.transaction();
  try {
    const installment = await trx('tbl_scheme_installments').where({ Installment_ID: req.body.Installment_ID }).first();
    if (!installment) { await trx.rollback(); return sendError(res, 404, 'Installment not found.'); }

    await trx('tbl_scheme_installments').where({ Installment_ID: req.body.Installment_ID }).update({
      Status: 'Paid', Paid_Date: new Date(),
      Payment_Mode: req.body.Payment_Mode,
      Receipt_Number: req.body.Receipt_Number || null,
    });

    // Update enrollment totals
    const enrollment = await trx('tbl_saving_scheme_enrollment').where({ Enrollment_ID: installment.Enrollment_ID }).first();
    const newPaid = (parseInt(enrollment.Installments_Paid) || 0) + 1;
    const newAmount = parseFloat(enrollment.Total_Amount_Paid || 0) + parseFloat(installment.Amount);

    // Check if all installments paid → mark Matured
    const pending = await trx('tbl_scheme_installments')
      .where({ Enrollment_ID: installment.Enrollment_ID, Status: 'Pending' }).count('Installment_ID as c').first();

    await trx('tbl_saving_scheme_enrollment').where({ Enrollment_ID: installment.Enrollment_ID }).update({
      Installments_Paid: newPaid,
      Total_Amount_Paid: newAmount,
      Status: parseInt(pending.c) === 0 ? 'Matured' : 'Active',
    });

    await trx.commit();
    return sendSuccess(res, null, 'Installment recorded.');
  } catch (err) {
    await trx.rollback();
    return sendError(res, 500, 'Failed to record installment.');
  }
});

module.exports = router;
