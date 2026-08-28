const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { requireModuleAccess } = require('../utils/moduleOverride');
const dayjs = require('dayjs');

// ── Gem/Diamond Certification ────────────────────────────────────────────────────
router.get('/certificates', authenticate, requireModuleAccess('guarantor_certification', 'View'), async (req, res) => {
  const { ornamentId } = req.query;
  try {
    let qb = db('tbl_gem_certificate').where('Tenant_ID', req.user.tenantId).where('Is_Active', true);
    if (ornamentId) qb = qb.where('Ornament_ID', ornamentId);
    return sendSuccess(res, await qb.orderBy('Certificate_Date', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch certificates.'); }
});

router.post('/certificates', authenticate, requireModuleAccess('guarantor_certification', 'Add'), [body('Certifying_Lab').notEmpty(), body('Certificate_Number').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_gem_certificate').insert({ ...req.body, Tenant_ID: req.user.tenantId }).returning('*');
    return sendSuccess(res, row, 'Certificate recorded.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'This lab + certificate number combination already exists.');
    return sendError(res, 500, 'Failed to record certificate.');
  }
});

// ── Reorder Requests ────────────────────────────────────────────────────────────
router.get('/reorder-requests', authenticate, requireModuleAccess('reorder_rfid_card_charges', 'View'), async (req, res) => {
  const { status } = req.query;
  try {
    let qb = db('tbl_reorder_request as r')
      .leftJoin('tbl_item_type_master as t', 'r.Type_ID', 't.Type_ID')
      .leftJoin('tbl_design_master as d', 'r.Design_ID', 'd.Design_ID')
      .where('r.Tenant_ID', req.user.tenantId).select('r.*', 't.Type_Name', 'd.Design_Name');
    if (status) qb = qb.where('r.Status', status);
    else qb = qb.whereNot('r.Status', 'Cancelled');
    return sendSuccess(res, await qb.orderBy('r.Created_Date', 'desc'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch reorder requests.'); }
});

// POST /reorder-requests/auto-scan — scans tbl_ornament_master grouped by
// Type_ID/Design_ID for stock below Min_Stock_Level and raises one reorder
// request per below-threshold group, skipping any group that already has
// an open request (avoids spamming duplicates on repeated scans).
router.post('/reorder-requests/auto-scan', authenticate, requireModuleAccess('reorder_rfid_card_charges', 'Add'), async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    const low = await db('tbl_ornament_master')
      .where('Tenant_ID', tenantId).where('Is_Active', true).where('Is_Sold', false)
      .groupBy('Type_ID', 'Design_ID')
      .select('Type_ID', 'Design_ID')
      .select(db.raw('SUM("Stock_Quantity") as total_qty'))
      .select(db.raw('MIN("Min_Stock_Level") as min_level'))
      .havingRaw('SUM("Stock_Quantity") < MIN("Min_Stock_Level")');

    const created = [];
    for (const group of low) {
      const existingOpen = await db('tbl_reorder_request').where({ Tenant_ID: tenantId, Type_ID: group.Type_ID, Design_ID: group.Design_ID, Status: 'Pending' }).first();
      if (existingOpen) continue;
      const [row] = await db('tbl_reorder_request').insert({
        Tenant_ID: tenantId, Type_ID: group.Type_ID, Design_ID: group.Design_ID,
        Requested_Qty: Math.max(1, group.min_level - group.total_qty),
        Reason: `Auto: stock (${group.total_qty}) below minimum (${group.min_level})`,
        Status: 'Pending', Requested_By: req.user.username,
      }).returning('*');
      created.push(row);
    }
    return sendSuccess(res, created, `${created.length} new reorder request(s) raised.`, 201);
  } catch (err) { return sendError(res, 500, 'Failed to auto-scan for reorder: ' + err.message); }
});

router.post('/reorder-requests', authenticate, requireModuleAccess('reorder_rfid_card_charges', 'Add'), [body('Requested_Qty').isInt({ gt: 0 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_reorder_request').insert({ ...req.body, Tenant_ID: req.user.tenantId, Status: 'Pending', Requested_By: req.user.username }).returning('*');
    return sendSuccess(res, row, 'Reorder request created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create reorder request.'); }
});

router.put('/reorder-requests/:id', authenticate, requireModuleAccess('reorder_rfid_card_charges', 'Edit'), [body('Status').isIn(['Pending', 'Ordered', 'Received', 'Cancelled'])], async (req, res) => {
  // Real, previously-broken bug: this validator was declared but never
  // enforced — an out-of-enum Status was accepted with 200 and persisted
  // straight to the DB.
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_reorder_request').where({ Request_ID: req.params.id, Tenant_ID: req.user.tenantId }).update(req.body).returning('*');
    if (!row) return sendError(res, 404, 'Reorder request not found.');
    return sendSuccess(res, row, 'Reorder request updated.');
  } catch (err) { return sendError(res, 500, 'Failed to update reorder request.'); }
});

// ── RFID Scan Log ────────────────────────────────────────────────────────────────
router.get('/rfid-scans', authenticate, requireModuleAccess('reorder_rfid_card_charges', 'View'), async (req, res) => {
  const { rfidTag, ornamentId } = req.query;
  try {
    let qb = db('tbl_rfid_scan_log').where('Tenant_ID', req.user.tenantId);
    if (rfidTag) qb = qb.where('RFID_Tag', rfidTag);
    if (ornamentId) qb = qb.where('Ornament_ID', ornamentId);
    return sendSuccess(res, await qb.orderBy('Scan_Date', 'desc').limit(200));
  } catch (err) { return sendError(res, 500, 'Failed to fetch RFID scans.'); }
});

router.post('/rfid-scans', authenticate, requireModuleAccess('reorder_rfid_card_charges', 'Add'), [body('RFID_Tag').notEmpty(), body('Scan_Type').isIn(['Stock Check', 'Sale', 'Transfer', 'Audit', 'Gate'])], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const ornament = await db('tbl_ornament_master').where({ Tenant_ID: req.user.tenantId, RFID_Tag: req.body.RFID_Tag }).first();
    const [row] = await db('tbl_rfid_scan_log').insert({
      ...req.body, Tenant_ID: req.user.tenantId, Ornament_ID: ornament?.Ornament_ID || null, Scanned_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, { ...row, matchedOrnament: ornament || null }, 'Scan logged.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to log scan.'); }
});

// ── Card Surcharge Master ──────────────────────────────────────────────────────
router.get('/card-charges', authenticate, requireModuleAccess('reorder_rfid_card_charges', 'View'), async (req, res) => {
  try { return sendSuccess(res, await db('tbl_card_charges_master').where('Tenant_ID', req.user.tenantId).where('Is_Active', true)); }
  catch (err) { return sendError(res, 500, 'Failed to fetch card charges.'); }
});

router.post('/card-charges', authenticate, requireModuleAccess('reorder_rfid_card_charges', 'Add'), [body('Card_Type').isIn(['Credit', 'Debit', 'Wallet'])], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_card_charges_master').insert({ ...req.body, Tenant_ID: req.user.tenantId }).returning('*');
    return sendSuccess(res, row, 'Card charge rule created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create card charge rule.'); }
});

module.exports = router;
