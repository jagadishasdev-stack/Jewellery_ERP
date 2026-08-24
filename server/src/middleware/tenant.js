const { sendError } = require('../utils/response');

/**
 * Attaches req.tenantId for convenience. Actual database routing to the
 * correct tenant happens in ../middleware/auth.js's authenticate() — see
 * ../db/tenantDb.js and ../db/tenantDbResolver.js.
 */
const setTenantContext = async (req, res, next) => {
  if (!req.user) return next();

  const tenantId = req.user.tenantId;
  if (!tenantId) return next();

  try {
    req.tenantId = tenantId;
    next();
  } catch (err) {
    console.error('Tenant context error:', err);
    return sendError(res, 500, 'Failed to establish tenant context.');
  }
};

module.exports = { setTenantContext };
