/**
 * Branch access — the real, DB-backed enforcement layer.
 * middleware/branchMode.js only PARSES the X-Branch-ID header into
 * req.branchId; nothing there validates whether the caller may actually
 * use it. This file is where that's actually checked, per the spec's own
 * rule (§30/31): branch isolation must be enforced on the backend, never
 * assumed from a header/dropdown a client could just as easily forge.
 */
const db = require('../db/tenantDb').tenantDb;
const { sendError } = require('./response');

const branchVal = (req) => req.branchId || null;

/**
 * Resolves what branches this user may actually access.
 * @returns {Promise<{allBranches: boolean, branchIds: string[]}>}
 *   allBranches=true means branchIds is irrelevant (every branch, incl. new
 *   ones added later, without needing a row per branch).
 */
async function getAllowedBranches(req) {
  const { tenantId, userId, roleName } = req.user;
  if (roleName === 'Super Admin') return { allBranches: true, branchIds: [] };

  const user = await db('tbl_user_master').where({ User_ID: userId, Tenant_ID: tenantId }).first('All_Branch_Access', 'Branch_ID');
  if (user?.All_Branch_Access) return { allBranches: true, branchIds: [] };

  const rows = await db('tbl_user_branch_access').where({ Tenant_ID: tenantId, User_ID: userId }).select('Branch_ID');
  const branchIds = rows.map((r) => r.Branch_ID);
  // A user's own home branch (tbl_user_master.Branch_ID) is always
  // included even with no explicit grant row — otherwise creating a
  // branch manager would require BOTH setting their home branch AND
  // separately granting access to that same branch, an easy step to miss.
  if (user?.Branch_ID && !branchIds.includes(user.Branch_ID)) branchIds.push(user.Branch_ID);
  return { allBranches: false, branchIds };
}

/**
 * Middleware: validates req.branchId (from branchMode.js) against what
 * this user may actually access. Must run AFTER authenticate (needs
 * req.user). Deliberately a no-op when req.branchId is null — see
 * branchMode.js's own comment for why that's the safe default for routes
 * not yet migrated to branch-awareness, vs. a real branch id or 'ALL'
 * which ARE checked.
 */
const requireValidBranch = async (req, res, next) => {
  if (!req.branchId) return next();
  try {
    const access = await getAllowedBranches(req);
    if (req.branchId === 'ALL') {
      if (!access.allBranches) return sendError(res, 403, 'You do not have permission to view All Branches.');
      return next();
    }
    if (!access.allBranches && !access.branchIds.includes(req.branchId)) {
      return sendError(res, 403, 'You do not have access to that branch.');
    }
    // Activates the audit trail's own (already-built, previously dormant)
    // branch column — auditLogger.js has always read req.user.branchId,
    // but nothing ever set it, since branch context lives in a per-request
    // header, not the JWT. This is the actual branch THIS request/action
    // happened in — a better fit for "which branch did this happen at"
    // than a static home-branch claim would be, and correctly stays unset
    // for an 'ALL'-branches or no-branch-context request, which isn't
    // attributable to any one branch.
    req.user.branchId = req.branchId;
    next();
  } catch (err) {
    return sendError(res, 500, 'Branch access check failed.');
  }
};

/**
 * Applies the branch filter to a knex query builder in-place, IF the
 * current context is a specific branch (not null, not 'ALL'). Call this
 * only in routes that already ran requireValidBranch, so the value is
 * known-good by the time it reaches a query.
 */
const withBranch = (qb, req, column = 'Branch_ID') => {
  const b = branchVal(req);
  if (b && b !== 'ALL') return qb.where(column, b);
  return qb;
};

/**
 * What to actually WRITE as Branch_ID on a new row: the active specific
 * branch context if there is one; otherwise whatever the caller
 * explicitly passed in the request body (preserving old behavior for
 * callers that don't send the header at all yet); otherwise null.
 */
const resolveBranchForInsert = (req, bodyBranchId) => {
  const b = branchVal(req);
  if (b && b !== 'ALL') return b;
  return bodyBranchId || null;
};

module.exports = { branchVal, getAllowedBranches, requireValidBranch, withBranch, resolveBranchForInsert };
