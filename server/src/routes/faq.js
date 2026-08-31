/**
 * FAQ — Kumudu Schema Audit gap (no equivalent found anywhere before).
 * Admin CRUD only for now; exposing this to the public mobile app (the
 * way savingsAppCore.js's other endpoints are) is a separate app-side
 * integration decision, not assumed here.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  try {
    return sendSuccess(res, await db('tbl_faq').where('Tenant_ID', req.user.tenantId).orderBy('Sort_Order'));
  } catch (err) { return sendError(res, 500, 'Failed to fetch FAQs.'); }
});

router.post('/', authenticate, [body('Question').notEmpty(), body('Answer').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_faq').insert({ ...req.body, Tenant_ID: req.user.tenantId }).returning('*');
    return sendSuccess(res, row, 'FAQ added.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to add FAQ.'); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const body2 = { ...req.body };
    delete body2.Tenant_ID; delete body2.FAQ_ID;
    const [row] = await db('tbl_faq').where({ FAQ_ID: req.params.id, Tenant_ID: req.user.tenantId }).update(body2).returning('*');
    if (!row) return sendError(res, 404, 'Not found.');
    return sendSuccess(res, row, 'Updated.');
  } catch (err) { return sendError(res, 500, 'Failed to update FAQ.'); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const count = await db('tbl_faq').where({ FAQ_ID: req.params.id, Tenant_ID: req.user.tenantId }).del();
    if (!count) return sendError(res, 404, 'Not found.');
    return sendSuccess(res, null, 'Deleted.');
  } catch (err) { return sendError(res, 500, 'Failed to delete FAQ.'); }
});

module.exports = router;
