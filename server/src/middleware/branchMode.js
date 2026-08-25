/**
 * branchMode middleware
 * ─────────────────────
 * Reads the current branch context from request header X-Branch-ID.
 * Injects req.branchId into every request:
 *   - a real Branch_ID string  → caller is working in that specific branch
 *   - 'ALL'                    → caller asked for the consolidated,
 *                                 all-branches view
 *   - null                     → no header sent at all. Deliberately NOT
 *                                 the same as 'ALL' — this is the
 *                                 unmigrated-route default, meaning
 *                                 "don't filter, behave exactly like
 *                                 before this feature existed." Only
 *                                 routes that opt in (via
 *                                 utils/branchAccess.js's requireValidBranch/
 *                                 withBranch) actually enforce or filter by
 *                                 branch — this middleware only parses the
 *                                 header, it never validates or rejects
 *                                 anything (that needs req.user, which
 *                                 doesn't exist yet this early in the
 *                                 pipeline — see authenticate).
 *
 * Mirrors middleware/dataMode.js's shape exactly, same rollout reasoning:
 * one small always-on parser, plus separate per-route opt-in enforcement.
 */
const setBranchContext = (req, res, next) => {
  const raw = req.headers['x-branch-id'];
  req.branchId = raw === 'ALL' ? 'ALL' : (raw ? String(raw) : null);
  next();
};

module.exports = { setBranchContext };
