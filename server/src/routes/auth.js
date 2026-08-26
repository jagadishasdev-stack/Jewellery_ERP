const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
// Control-plane connection — tbl_role_master and tbl_tenant_master always live here.
const db = require('../db/knex');
// Login/refresh run before authenticate() has resolved a tenant DB context, so they
// look it up explicitly instead of using the tenantDb proxy.
const { getTenantDb } = require('../db/tenantDbResolver');
const { tenantDb, runWithTenantDb } = require('../db/tenantDb');
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
    body('tenantId').trim().notEmpty().withMessage('Tenant ID is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    const { username, password, tenantId } = req.body;

    try {
      let tenantConn;
      try {
        tenantConn = await getTenantDb(tenantId);
      } catch {
        return sendError(res, 401, 'Invalid username or password.');
      }

      // Fetch user from the tenant's own database, role from the control-plane one.
      const user = await tenantConn('tbl_user_master')
        .where({ Tenant_ID: tenantId, Username: username })
        .first();

      if (!user) return sendError(res, 401, 'Invalid username or password.');
      if (!user.Is_Active) return sendError(res, 403, 'User account is disabled.');

      const role = await db('tbl_role_master').where({ Role_ID: user.Role_ID }).first();
      if (!role) return sendError(res, 500, 'User role is misconfigured.');

      // Check lock
      if (user.Locked_Until && new Date(user.Locked_Until) > new Date()) {
        return sendError(res, 403, `Account locked until ${new Date(user.Locked_Until).toLocaleString()}.`);
      }

      // Verify password
      const valid = await bcrypt.compare(password, user.Password_Hash);
      if (!valid) {
        // Increment failed attempts
        const attempts = (user.Login_Attempts || 0) + 1;
        const update = { Login_Attempts: attempts };
        if (attempts >= 5) {
          update.Locked_Until = new Date(Date.now() + 30 * 60 * 1000); // lock 30 min
        }
        await tenantConn('tbl_user_master').where({ User_ID: user.User_ID }).update(update);
        return sendError(res, 401, 'Invalid username or password.');
      }

      // Check tenant license (always on the control-plane connection)
      const tenant = await db('tbl_tenant_master')
        .where({ Tenant_ID: tenantId })
        .select('Is_Active', 'License_Expiry_Date', 'Company_Name', 'GST_No')
        .first();

      if (!tenant) return sendError(res, 403, 'Tenant not found.');
      if (!tenant.Is_Active) return sendError(res, 403, 'Tenant account is inactive.');
      if (role.Role_Name !== 'Super Admin' && new Date(tenant.License_Expiry_Date) < new Date()) {
        return sendError(res, 403, 'License expired. Please renew.');
      }

      // Build JWT payload. tbl_user_master.Custom_Permissions is a per-user
      // override on top of the role's own permissions — set via the
      // "Custom Permissions" modal in UsersPage.jsx, which only ever writes
      // the keys an admin explicitly toggled away from the role default
      // (see that page's `effective = custom !== undefined ? custom : fromRole`).
      // A shallow merge with the override last reproduces that exact
      // semantics server-side: any key not explicitly overridden falls
      // back to the role's value.
      const rolePermissions = typeof role.Permissions === 'string'
        ? JSON.parse(role.Permissions) : role.Permissions;
      const customPermissions = user.Custom_Permissions
        ? (typeof user.Custom_Permissions === 'string' ? JSON.parse(user.Custom_Permissions) : user.Custom_Permissions)
        : {};
      const permissions = { ...rolePermissions, ...customPermissions };

      const tokenPayload = {
        userId: user.User_ID,
        tenantId: user.Tenant_ID,
        roleId: user.Role_ID,
        roleName: role.Role_Name,
        username: user.Username,
        fullName: user.Full_Name,
        permissions,
      };

      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      });

      const refreshToken = jwt.sign(
        { userId: user.User_ID, tenantId: user.Tenant_ID },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
      );

      // Update last login & reset attempts
      await tenantConn('tbl_user_master').where({ User_ID: user.User_ID }).update({
        Last_Login_Date: new Date(),
        Last_Login_IP: req.ip,
        Login_Attempts: 0,
        Locked_Until: null,
      });

      // Create session
      const sessionId = uuidv4();
      await tenantConn('tbl_session_master').insert({
        Session_ID: sessionId,
        Tenant_ID: tenantId,
        User_ID: user.User_ID,
        IP_Address: req.ip,
        Device_Info: req.headers['user-agent'],
        Is_Active: true,
      });

      // ── Audit: LOGIN ─────────────────────────────────────────────────────
      // No authenticate() has run yet for this request, so auditLog (which
      // uses the tenantDb proxy) needs an explicit tenant DB context.
      //
      // req.user isn't set yet either (that's authenticate()'s job, and this
      // request never goes through it) — attach it directly rather than
      // spreading `req` into a plain object: Express's req.headers/req.ip are
      // inherited getters, not own properties, so `{ ...req }` silently drops
      // them, which made this audit entry fail on every login (pre-existing
      // bug, unrelated to the tenant-DB work — fixed here since it's on the
      // same line).
      req.user = { username: user.Username, fullName: user.Full_Name };
      const { auditLog } = require('../utils/auditLogger');
      await runWithTenantDb(tenantConn, () => auditLog({
        tenantId,
        userId: user.User_ID,
        tableName: 'tbl_session_master',
        recordId: sessionId,
        actionType: 'LOGIN',
        description: `User "${user.Username}" logged in`,
        newData: { ip: req.ip, device: req.headers['user-agent']?.substring(0, 100) },
        req,
      }));

      return sendSuccess(res, {
        token,
        refreshToken,
        sessionId,
        user: {
          userId: user.User_ID,
          username: user.Username,
          fullName: user.Full_Name,
          tenantId: user.Tenant_ID,
          roleName: role.Role_Name,
          permissions,
          companyName: tenant.Company_Name,
          // Was never returned at all — the thermal receipt template has
          // supported printing a "GST: ..." line since it was built, but
          // nothing ever fetched or passed the tenant's own GSTIN in for
          // it to use, so the line never actually appeared on a receipt.
          gstNo: tenant.GST_No || null,
        },
      }, 'Login successful');
    } catch (err) {
      console.error('Login error:', err);
      return sendError(res, 500, 'Login failed. Please try again.');
    }
  }
);

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
// authenticate() has already resolved this request's tenant DB context, so the
// tenantDb proxy (not the plain control-plane `db`) is what's used here.
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (sessionId) {
      await tenantDb('tbl_session_master')
        .where({ Session_ID: sessionId })
        .update({ Is_Active: false, Session_End: new Date() });
    }
    return sendSuccess(res, null, 'Logged out successfully.');
  } catch (err) {
    return sendError(res, 500, 'Logout failed.');
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return sendError(res, 401, 'Refresh token required.');

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    let tenantConn;
    try {
      tenantConn = await getTenantDb(decoded.tenantId);
    } catch {
      return sendError(res, 401, 'User not found or inactive.');
    }

    const user = await tenantConn('tbl_user_master').where({ User_ID: decoded.userId }).first();
    if (!user || !user.Is_Active) return sendError(res, 401, 'User not found or inactive.');

    const role = await db('tbl_role_master').where({ Role_ID: user.Role_ID }).first();
    if (!role) return sendError(res, 500, 'User role is misconfigured.');

    // Same Custom_Permissions merge as /login — see the comment there.
    const rolePermissions = typeof role.Permissions === 'string'
      ? JSON.parse(role.Permissions) : role.Permissions;
    const customPermissions = user.Custom_Permissions
      ? (typeof user.Custom_Permissions === 'string' ? JSON.parse(user.Custom_Permissions) : user.Custom_Permissions)
      : {};
    const permissions = { ...rolePermissions, ...customPermissions };

    const newToken = jwt.sign(
      { userId: user.User_ID, tenantId: user.Tenant_ID, roleId: user.Role_ID, roleName: role.Role_Name, username: user.Username, fullName: user.Full_Name, permissions },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    return sendSuccess(res, { token: newToken }, 'Token refreshed.');
  } catch (err) {
    return sendError(res, 401, 'Invalid or expired refresh token.');
  }
});

// ─── GET /api/auth/validate ───────────────────────────────────────────────────
router.get('/validate', authenticate, (req, res) => {
  return sendSuccess(res, { user: req.user }, 'Token is valid.');
});

// ─── PUT /api/auth/change-password — any logged-in user changes their OWN password ──
// Previously the only way to change a password was a Super Admin (or, for
// their own tenant's users, a Client Admin — see tenant.js's PUT
// /users/:id) resetting it FOR someone. No one could change their own
// while logged in.
//
// This used to also write the plain-text password into Default_Password
// for the Super Admin's tenant-users view — stopped: a user changing their
// OWN password is choosing it themselves (often reusing a personal
// password elsewhere), and there's no legitimate reason the vendor's
// Super Admin needs to be able to read it back afterward. Applies to every
// admin-driven reset too (tenant.js, superAdmin.js) — old rows already
// written are left alone, this just stops the column growing further.
router.put(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required.'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    const { currentPassword, newPassword } = req.body;
    try {
      const user = await db('tbl_user_master').where({ User_ID: req.user.userId }).first();
      if (!user) return sendError(res, 404, 'User not found.');

      const valid = await bcrypt.compare(currentPassword, user.Password_Hash);
      if (!valid) return sendError(res, 401, 'Current password is incorrect.');

      if (newPassword === currentPassword) {
        return sendError(res, 400, 'New password must be different from your current password.');
      }

      const salt = await bcrypt.genSalt(12);
      const hash = await bcrypt.hash(newPassword, salt);

      await db('tbl_user_master').where({ User_ID: req.user.userId }).update({
        Password_Hash: hash,
        Password_Salt: salt,
        Modified_Date: new Date(),
      });

      return sendSuccess(res, null, 'Password changed successfully.');
    } catch (err) {
      console.error('Change password error:', err.message);
      return sendError(res, 500, 'Failed to change password.');
    }
  }
);

// ─── GET /api/auth/store-assets/:tenantId ──────────────────────────────────
// Public — no login required. Mirrors the old savings-app storefront
// endpoint of the same name/shape so the savings_app mobile frontend's
// StoreContext.js can keep calling it unchanged; the :tenantId here is a
// real Jewellery ERP Tenant_ID string (e.g. "DLJ"), not the old numeric
// Store_ID the legacy shape implies. Runs before any login, so the
// dashboard has something non-null to render instead of hanging on
// "Loading Dashboard..." forever.
router.get('/store-assets/:tenantId', async (req, res) => {
  try {
    const tenant = await db('tbl_tenant_master')
      .where({ Tenant_ID: req.params.tenantId })
      .first();
    if (!tenant) return sendError(res, 404, 'Store not found.');

    // No product-catalog/e-commerce banner tables are wired to this app
    // for any tenant yet, so these come back genuinely empty rather than
    // fabricated placeholder content — the dashboard already treats an
    // empty list as "nothing to show" gracefully, and is_ecom_enable
    // stays false until a real e-commerce catalog exists for this tenant.
    return sendSuccess(res, {
      categories: [],
      storeImages: [],
      storeinfo: [{ is_ecom_enable: false, store_name: tenant.Company_Name }],
    });
  } catch (err) {
    console.error('store-assets error:', err.message);
    return sendError(res, 500, 'Failed to fetch store assets.');
  }
});

module.exports = router;
