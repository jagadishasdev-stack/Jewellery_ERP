const jwt = require('jsonwebtoken');
const { sendError } = require('../utils/response');
const { getTenantDb } = require('../db/tenantDbResolver');
const { runWithTenantDb } = require('../db/tenantDb');
const controlDb = require('../db/knex');

// POST /api/auth/login already refuses an inactive tenant or an expired
// license — but that check only ever ran at login time. A JWT is valid
// for up to JWT_EXPIRES_IN (24h default), so a tenant deactivated (AMC
// unpaid) or expired mid-session could keep working, fully authenticated,
// until their token happened to expire — nothing re-checked tenant status
// on the requests in between. This cache lets `authenticate` re-check on
// every request (near-real-time lockout: at most STATUS_CACHE_TTL_MS old)
// without hitting tbl_tenant_master on every single one — a plain indexed
// PK lookup is cheap, but this app makes a LOT of authenticated requests.
const STATUS_CACHE_TTL_MS = 30 * 1000;
const statusCache = new Map(); // Tenant_ID -> { isActive, licenseExpiry, cachedAt }

async function getTenantStatus(tenantId) {
  const cached = statusCache.get(tenantId);
  if (cached && Date.now() - cached.cachedAt < STATUS_CACHE_TTL_MS) return cached;

  const tenant = await controlDb('tbl_tenant_master')
    .where('Tenant_ID', tenantId)
    .first('Is_Active', 'License_Expiry_Date');
  const status = {
    isActive: !!tenant?.Is_Active,
    licenseExpiry: tenant?.License_Expiry_Date || null,
    exists: !!tenant,
    cachedAt: Date.now(),
  };
  statusCache.set(tenantId, status);
  return status;
}

/**
 * Verifies the JWT token from Authorization header, attaches the decoded
 * payload to req.user, then resolves that tenant's own database connection
 * and runs the rest of the request inside it (see ../db/tenantDb.js) — this
 * is the one place tenant-DB routing plugs into every protected route.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 401, 'Authentication required. Please provide a valid token.');
  }

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendError(res, 401, 'Token expired. Please login again.');
    }
    return sendError(res, 401, 'Invalid token.');
  }

  req.user = decoded; // { userId, tenantId, roleId, roleName, permissions, username }

  // Same checks POST /api/auth/login makes, re-run on every request (not
  // just at login) so deactivating a tenant or letting its license lapse
  // takes effect within STATUS_CACHE_TTL_MS, not "whenever their token
  // next expires." Super Admin's own tenant (SA_MASTER) is never
  // deactivated in practice, so this doesn't need a special exemption
  // beyond the same license-expiry exemption login already gives Super
  // Admin role users.
  try {
    const status = await getTenantStatus(decoded.tenantId);
    if (!status.exists || !status.isActive) {
      return sendError(res, 403, 'Tenant account is inactive. Contact your ERP provider.');
    }
    if (decoded.roleName !== 'Super Admin' && status.licenseExpiry && new Date(status.licenseExpiry) < new Date()) {
      return sendError(res, 403, 'License expired. Please renew.');
    }
  } catch (err) {
    console.error('Tenant status check error:', err.message);
    return sendError(res, 500, 'Could not verify tenant status.');
  }

  try {
    const tenantDb = await getTenantDb(decoded.tenantId);
    runWithTenantDb(tenantDb, next);
  } catch (err) {
    console.error('Tenant DB resolution error:', err.message);
    return sendError(res, 500, 'Could not connect to your tenant database.');
  }
};

/**
 * Requires Super Admin role.
 */
const requireSuperAdmin = (req, res, next) => {
  if (req.user?.roleName !== 'Super Admin') {
    return sendError(res, 403, 'Super Admin access required.');
  }
  next();
};

/**
 * Requires a specific permission from the role's permissions JSON.
 */
const requirePermission = (permission) => (req, res, next) => {
  const permissions = req.user?.permissions || {};
  if (!permissions[permission]) {
    return sendError(res, 403, `Access denied. Required permission: ${permission}`);
  }
  next();
};

/**
 * Allows Super Admin to access any tenant, or validates user belongs to requested tenant.
 */
const requireTenantAccess = (req, res, next) => {
  const { user } = req;
  const requestedTenantId = req.params.tenantId || req.body?.tenantId || req.query?.tenantId;

  if (user.roleName === 'Super Admin') {
    return next(); // Super admin can access all tenants
  }

  if (requestedTenantId && requestedTenantId !== user.tenantId) {
    return sendError(res, 403, 'Cross-tenant access denied.');
  }

  next();
};

/**
 * Called by Super Admin routes right after flipping Is_Active or changing
 * License_Expiry_Date, so the lockout/unlock takes effect on that tenant's
 * very next request instead of waiting up to STATUS_CACHE_TTL_MS.
 */
const invalidateTenantStatus = (tenantId) => statusCache.delete(tenantId);

module.exports = { authenticate, requireSuperAdmin, requirePermission, requireTenantAccess, invalidateTenantStatus };
