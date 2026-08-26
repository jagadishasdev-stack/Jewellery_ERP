/**
 * Per-user, per-module View/Add/Edit/Delete/Approve overrides —
 * tbl_user_permission_override existed with a full CRUD screen
 * (Permissions > Overrides tab) since early this project, but nothing
 * ever read it back: an admin granting or restricting a staff member's
 * access to a specific module (Pawnbroking, HR Payroll, CRM, ...) did
 * nothing at all (found via audit). Same opt-in shape as
 * utils/binAccess.js's getAllowedBinScope: a user with NO override row
 * for this module is unaffected (the safe default for every user
 * nobody has ever explicitly overridden); a row, when present, is
 * authoritative for that one action — it can grant beyond the user's
 * role or restrict below it.
 *
 * Full coverage across every module in PermissionsPage.jsx's own
 * MODULE_KEYS list (pawnbroking, insurance_amc, hr_payroll, crm,
 * bank_cheque, rate_booking_agent_commission, hsn_einvoice_loyalty,
 * manufacturing_bom, guarantor_certification,
 * reorder_rfid_card_charges, tally_bridge) is a larger retrofit than
 * fits in one pass — this is wired into Pawnbroking (real money, the
 * module with the most existing test coverage) as the first, fully-
 * real example; the rest still need the same treatment.
 */
const db = require('../db/tenantDb').tenantDb;
const { sendError } = require('./response');

/**
 * @param {string} moduleKey - matches PermissionsPage.jsx's MODULE_KEYS
 * @param {'View'|'Add'|'Edit'|'Delete'|'Approve'} action
 */
function requireModuleAccess(moduleKey, action) {
  const column = `Can_${action}`;
  return async (req, res, next) => {
    try {
      const override = await db('tbl_user_permission_override')
        .where({ User_ID: req.user.userId, Module_Key: moduleKey }).first();
      if (!override) return next(); // no override on record for this module — unrestricted
      if (!override[column]) return sendError(res, 403, `You don't have ${action} access to ${moduleKey}.`);
      next();
    } catch (err) { return sendError(res, 500, 'Permission check failed.'); }
  };
}

module.exports = { requireModuleAccess };
