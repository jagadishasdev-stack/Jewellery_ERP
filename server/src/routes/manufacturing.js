const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const dayjs = require('dayjs');

// ── Production Departments ──────────────────────────────────────────────────────
router.get('/departments', authenticate, async (req, res) => {
  try { return sendSuccess(res, await db('tbl_production_department_master').where('Tenant_ID', req.user.tenantId).where('Is_Active', true).orderBy('Sequence_No')); }
  catch (err) { return sendError(res, 500, 'Failed to fetch departments.'); }
});

router.post('/departments', authenticate, [body('Dept_Code').notEmpty(), body('Dept_Name').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_production_department_master').insert({ ...req.body, Tenant_ID: req.user.tenantId }).returning('*');
    return sendSuccess(res, row, 'Department created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create department.'); }
});

// ── BOM ──────────────────────────────────────────────────────────────────────────
router.get('/bom', authenticate, async (req, res) => {
  const { designId } = req.query;
  try {
    let qb = db('tbl_bom_master').where('Tenant_ID', req.user.tenantId).where('Is_Active', true);
    if (designId) qb = qb.where('Design_ID', designId);
    return sendSuccess(res, await qb);
  } catch (err) { return sendError(res, 500, 'Failed to fetch BOMs.'); }
});

router.get('/bom/:id', authenticate, async (req, res) => {
  try {
    const bom = await db('tbl_bom_master').where({ BOM_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!bom) return sendError(res, 404, 'BOM not found.');
    const stages = await db('tbl_bom_department_stages as s')
      .leftJoin('tbl_production_department_master as d', 's.Dept_ID', 'd.Dept_ID')
      .where('s.BOM_ID', bom.BOM_ID).select('s.*', 'd.Dept_Name').orderBy('s.Sequence_No');
    return sendSuccess(res, { ...bom, stages });
  } catch (err) { return sendError(res, 500, 'Failed to fetch BOM.'); }
});

router.post('/bom', authenticate, [body('BOM_Name').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const { stages, ...header } = req.body;
  try {
    const [bom] = await db('tbl_bom_master').insert({ ...header, Tenant_ID: req.user.tenantId, Created_By: req.user.username }).returning('*');
    if (Array.isArray(stages) && stages.length) {
      await db('tbl_bom_department_stages').insert(stages.map((s, i) => ({ ...s, BOM_ID: bom.BOM_ID, Sequence_No: s.Sequence_No ?? i + 1 })));
    }
    return sendSuccess(res, bom, 'BOM created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create BOM: ' + err.message); }
});

// ── Production Transactions ─────────────────────────────────────────────────────
router.get('/production', authenticate, async (req, res) => {
  const { deptId, status } = req.query;
  try {
    let qb = db('tbl_production_transaction as p')
      .leftJoin('tbl_production_department_master as d', 'p.Dept_ID', 'd.Dept_ID')
      .leftJoin('tbl_vendor_master as k', 'p.Karigar_ID', 'k.Vendor_ID')
      .where('p.Tenant_ID', req.user.tenantId).select('p.*', 'd.Dept_Name', 'k.Vendor_Name as Karigar_Name');
    if (deptId) qb = qb.where('p.Dept_ID', deptId);
    if (status) qb = qb.where('p.Status', status);
    return sendSuccess(res, await qb.orderBy('p.Txn_Date', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch production transactions.'); }
});

router.post('/production', authenticate, [body('Input_Weight').isFloat({ gt: 0 }), body('Txn_Date').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_production_transaction').insert({ ...req.body, Tenant_ID: req.user.tenantId, Status: 'In Progress', Created_By: req.user.username }).returning('*');
    return sendSuccess(res, row, 'Production transaction opened.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to open production transaction.'); }
});

// PUT /:id/complete — records the actual output weight, deriving wastage
// from the input/output difference rather than requiring the caller to
// compute it.
router.put('/production/:id/complete', authenticate, [body('Output_Weight').isFloat({ gt: 0 })], async (req, res) => {
  try {
    const txn = await db('tbl_production_transaction').where({ Txn_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!txn) return sendError(res, 404, 'Production transaction not found.');
    const outputWeight = parseFloat(req.body.Output_Weight);
    const wastage = Math.max(0, parseFloat(txn.Input_Weight) - outputWeight);
    const wastagePct = Math.round((wastage / parseFloat(txn.Input_Weight)) * 10000) / 100;
    const [row] = await db('tbl_production_transaction').where('Txn_ID', txn.Txn_ID)
      .update({ Output_Weight: outputWeight, Wastage_Weight: wastage, Wastage_Pct: wastagePct, Status: 'Completed' }).returning('*');
    return sendSuccess(res, row, 'Production transaction completed.');
  } catch (err) { return sendError(res, 500, 'Failed to complete production transaction.'); }
});

// ── Melting / Refining Log ─────────────────────────────────────────────────────
router.get('/melting-refining', authenticate, async (req, res) => {
  const { processType } = req.query;
  try {
    let qb = db('tbl_melting_refining_log').where('Tenant_ID', req.user.tenantId);
    if (processType) qb = qb.where('Process_Type', processType);
    return sendSuccess(res, await qb.orderBy('Log_Date', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch melting/refining log.'); }
});

router.post('/melting-refining', authenticate, [
  body('Process_Type').isIn(['Melting', 'Refining']), body('Metal_Type').notEmpty(), body('Weight_In').isFloat({ gt: 0 }), body('Log_Date').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const weightIn = parseFloat(req.body.Weight_In);
    const weightOut = req.body.Weight_Out != null ? parseFloat(req.body.Weight_Out) : null;
    const lossWeight = weightOut != null ? Math.max(0, weightIn - weightOut) : 0;
    const lossPct = weightOut != null ? Math.round((lossWeight / weightIn) * 10000) / 100 : null;
    const [row] = await db('tbl_melting_refining_log').insert({
      ...req.body, Tenant_ID: req.user.tenantId, Loss_Weight: lossWeight, Loss_Pct: lossPct, Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, row, 'Melting/refining log created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to log melting/refining.'); }
});

// ── Mould / Rubber BOM Stock ─────────────────────────────────────────────────────
router.get('/moulds', authenticate, async (req, res) => {
  try { return sendSuccess(res, await db('tbl_mould_bom_stock').where('Tenant_ID', req.user.tenantId).where('Is_Active', true)); }
  catch (err) { return sendError(res, 500, 'Failed to fetch moulds.'); }
});

router.post('/moulds', authenticate, [body('Mould_Name').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_mould_bom_stock').insert({ ...req.body, Tenant_ID: req.user.tenantId, Created_By: req.user.username }).returning('*');
    return sendSuccess(res, row, 'Mould created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create mould.'); }
});

router.put('/moulds/:id/stock', authenticate, [body('delta').isInt()], async (req, res) => {
  try {
    const [row] = await db('tbl_mould_bom_stock').where({ Mould_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .increment('Stock_Qty', req.body.delta).returning('*');
    if (!row) return sendError(res, 404, 'Mould not found.');
    return sendSuccess(res, row, 'Mould stock updated.');
  } catch (err) { return sendError(res, 500, 'Failed to update mould stock.'); }
});

module.exports = router;
