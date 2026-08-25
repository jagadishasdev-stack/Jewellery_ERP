/**
 * Multi-Branch Management — branch access. See utils/branchAccess.js for
 * the actual enforcement; this file is just the CRUD/lookup surface the
 * client's branch selector and admin user-management screens call.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { getAllowedBranches } = require('../utils/branchAccess');

// Same admin bar as routes/permissions.js's requireAdminish — branch
// access is exactly the same class of "who can grant more than their own
// role gives them" decision as a module-permission override.
const requireAdminish = (req, res, next) => {
  if (!['Super Admin', 'Client Admin'].includes(req.user?.roleName)) {
    return sendError(res, 403, 'Admin access required to manage branch access.');
  }
  next();
};

// ── GET /api/branches/my-access — populates the client's branch selector ──────
router.get('/my-access', authenticate, async (req, res) => {
  try {
    const access = await getAllowedBranches(req);
    let branches;
    if (access.allBranches) {
      branches = await db('tbl_branch_master').where({ Tenant_ID: req.user.tenantId, Is_Active: true }).select('Branch_ID', 'Branch_Name', 'Branch_Code', 'Is_Head_Office');
    } else {
      branches = access.branchIds.length
        ? await db('tbl_branch_master').where({ Tenant_ID: req.user.tenantId, Is_Active: true }).whereIn('Branch_ID', access.branchIds).select('Branch_ID', 'Branch_Name', 'Branch_Code', 'Is_Head_Office')
        : [];
    }
    return sendSuccess(res, { allBranches: access.allBranches, branches });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch branch access.');
  }
});

// ── GET /api/branches/access/:userId — a specific user's explicit grants ──────
router.get('/access/:userId', authenticate, requireAdminish, async (req, res) => {
  try {
    const rows = await db('tbl_user_branch_access as a')
      .join('tbl_branch_master as b', 'a.Branch_ID', 'b.Branch_ID')
      .where({ 'a.Tenant_ID': req.user.tenantId, 'a.User_ID': req.params.userId })
      .select('a.Access_ID', 'a.Branch_ID', 'b.Branch_Name', 'a.Created_Date');
    const user = await db('tbl_user_master').where({ User_ID: req.params.userId, Tenant_ID: req.user.tenantId }).first('All_Branch_Access', 'Branch_ID');
    return sendSuccess(res, { allBranchAccess: !!user?.All_Branch_Access, homeBranchId: user?.Branch_ID || null, grants: rows });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch user branch access.');
  }
});

// ── POST /api/branches/access — grant a user access to one branch ─────────────
router.post('/access', authenticate, requireAdminish, [
  body('User_ID').notEmpty(), body('Branch_ID').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_user_branch_access')
      .insert({ User_ID: req.body.User_ID, Tenant_ID: req.user.tenantId, Branch_ID: req.body.Branch_ID, Created_By: req.user.username })
      .onConflict(['User_ID', 'Branch_ID']).ignore()
      .returning('*');
    return sendSuccess(res, row || null, 'Branch access granted.', 201);
  } catch (err) {
    return sendError(res, 500, 'Failed to grant branch access: ' + err.message);
  }
});

// ── DELETE /api/branches/access/:id — revoke one grant ────────────────────────
router.delete('/access/:id', authenticate, requireAdminish, async (req, res) => {
  try {
    const deleted = await db('tbl_user_branch_access').where({ Access_ID: req.params.id, Tenant_ID: req.user.tenantId }).del();
    if (!deleted) return sendError(res, 404, 'Grant not found.');
    return sendSuccess(res, null, 'Branch access revoked.');
  } catch (err) {
    return sendError(res, 500, 'Failed to revoke branch access.');
  }
});

// ── PUT /api/branches/access/:userId/all-access — toggle "sees every branch" ──
router.put('/access/:userId/all-access', authenticate, requireAdminish, [
  body('All_Branch_Access').isBoolean(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [row] = await db('tbl_user_master')
      .where({ User_ID: req.params.userId, Tenant_ID: req.user.tenantId })
      .update({ All_Branch_Access: req.body.All_Branch_Access })
      .returning(['User_ID', 'All_Branch_Access']);
    if (!row) return sendError(res, 404, 'User not found.');
    return sendSuccess(res, row, `All-branch access ${req.body.All_Branch_Access ? 'granted' : 'revoked'}.`);
  } catch (err) {
    return sendError(res, 500, 'Failed to update all-branch access.');
  }
});

module.exports = router;
