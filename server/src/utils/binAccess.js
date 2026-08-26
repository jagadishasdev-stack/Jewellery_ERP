/**
 * Bin/tray/hidden-location access — tbl_user_bin_access existed with a
 * full CRUD screen (Permissions > Bin/Tray Access) since early this
 * project, but nothing ever read it back: an admin who "restricted"
 * a staff member to specific trays/hidden locations got no actual
 * lockout (found via audit). Same opt-in-restriction shape as
 * utils/branchAccess.js's own getAllowedBranches: a user with NO grant
 * rows at all is unrestricted (the safe default for every user nobody
 * has ever explicitly restricted); a user with at least one row is
 * limited to exactly the trays/hidden locations granted.
 */
const db = require('../db/tenantDb').tenantDb;

/**
 * @returns {Promise<{restricted: boolean, trayIds: number[], hiddenLocationIds: number[]}>}
 */
async function getAllowedBinScope(req) {
  const rows = await db('tbl_user_bin_access').where({ User_ID: req.user.userId }).select('Tray_ID', 'Hidden_Location_ID');
  if (!rows.length) return { restricted: false, trayIds: [], hiddenLocationIds: [] };
  return {
    restricted: true,
    trayIds: rows.map((r) => r.Tray_ID).filter(Boolean),
    hiddenLocationIds: rows.map((r) => r.Hidden_Location_ID).filter(Boolean),
  };
}

module.exports = { getAllowedBinScope };
