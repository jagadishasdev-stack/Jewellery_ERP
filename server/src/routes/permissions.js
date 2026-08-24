const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

// ── Per-user module permission overrides ────────────────────────────────────────
router.get('/overrides/:userId', authenticate, async (req, res) => {
  try { return sendSuccess(res, await db('tbl_user_permission_override').where('User_ID', req.params.userId)); }
  catch (err) { return sendError(res, 500, 'Failed to fetch permission overrides.'); }
});

// Only an admin-level user should be able to grant themselves or others
// extra permissions beyond their role — same bar the app already uses for
// platform-wide config (requireSuperAdmin exists for that); here we accept
// either Super Admin or the tenant's own Client Admin role.
const requireAdminish = (req, res, next) => {
  if (!['Super Admin', 'Client Admin'].includes(req.user?.roleName)) return sendError(res, 403, 'Admin access required to change permission overrides.');
  next();
};

router.post('/overrides', authenticate, requireAdminish, [body('User_ID').notEmpty(), body('Module_Key').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const existing = await db('tbl_user_permission_override').where({ User_ID: req.body.User_ID, Module_Key: req.body.Module_Key }).first();
    if (existing) {
      const [row] = await db('tbl_user_permission_override').where('Override_ID', existing.Override_ID).update(req.body).returning('*');
      return sendSuccess(res, row, 'Permission override updated.');
    }
    const [row] = await db('tbl_user_permission_override').insert({ ...req.body, Created_By: req.user.username }).returning('*');
    return sendSuccess(res, row, 'Permission override created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to save permission override: ' + err.message); }
});

router.delete('/overrides/:id', authenticate, requireAdminish, async (req, res) => {
  try {
    const deleted = await db('tbl_user_permission_override').where('Override_ID', req.params.id).del();
    if (!deleted) return sendError(res, 404, 'Override not found.');
    return sendSuccess(res, null, 'Permission override removed.');
  } catch (err) { return sendError(res, 500, 'Failed to remove override.'); }
});

// ── Per-user bin/tray access restriction ────────────────────────────────────────
router.get('/bin-access/:userId', authenticate, async (req, res) => {
  try {
    const rows = await db('tbl_user_bin_access as a')
      .leftJoin('tbl_tray_master as t', 'a.Tray_ID', 't.Tray_ID')
      .leftJoin('tbl_hidden_location_master as h', 'a.Hidden_Location_ID', 'h.Hidden_Location_ID')
      .where('a.User_ID', req.params.userId).select('a.*', 't.Tray_Name', 'h.Location_Name');
    return sendSuccess(res, rows);
  } catch (err) { return sendError(res, 500, 'Failed to fetch bin access.'); }
});

router.post('/bin-access', authenticate, requireAdminish, [body('User_ID').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  if (!req.body.Tray_ID && !req.body.Hidden_Location_ID) return sendError(res, 400, 'Either Tray_ID or Hidden_Location_ID is required.');
  try {
    const [row] = await db('tbl_user_bin_access').insert({ ...req.body, Created_By: req.user.username }).returning('*');
    return sendSuccess(res, row, 'Bin access granted.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to grant bin access.'); }
});

router.delete('/bin-access/:id', authenticate, requireAdminish, async (req, res) => {
  try {
    const deleted = await db('tbl_user_bin_access').where('Access_ID', req.params.id).del();
    if (!deleted) return sendError(res, 404, 'Access record not found.');
    return sendSuccess(res, null, 'Bin access revoked.');
  } catch (err) { return sendError(res, 500, 'Failed to revoke bin access.'); }
});

module.exports = router;
