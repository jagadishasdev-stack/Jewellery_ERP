const db = require('../db/knex');
const { sendError } = require('../utils/response');

/**
 * Validates that the tenant's license is active and not expired.
 * Runs after authenticate + setTenantContext.
 */
const validateLicense = async (req, res, next) => {
  // Skip for public routes
  const publicPaths = ['/api/auth/login', '/api/auth/refresh', '/api/license/validate'];
  if (publicPaths.some((p) => req.path.startsWith(p))) {
    return next();
  }

  if (!req.user) return next();

  // Super admin bypass
  if (req.user.roleName === 'Super Admin') return next();

  try {
    const tenant = await db('tbl_tenant_master')
      .where({ Tenant_ID: req.user.tenantId })
      .select('Is_Active', 'License_Expiry_Date')
      .first();

    if (!tenant) {
      return sendError(res, 403, 'Tenant not found.');
    }

    if (!tenant.Is_Active) {
      return sendError(res, 403, 'Tenant account is inactive. Please contact support.');
    }

    const expiry = new Date(tenant.License_Expiry_Date);
    if (expiry < new Date()) {
      return sendError(res, 403, `License expired on ${expiry.toDateString()}. Please renew.`);
    }

    next();
  } catch (err) {
    console.error('License validation error:', err);
    return sendError(res, 500, 'License validation failed.');
  }
};

module.exports = { validateLicense };
