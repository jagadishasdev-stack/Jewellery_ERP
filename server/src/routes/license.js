const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/knex');
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Generate a license key
const generateLicenseKey = (tenantCode, type) => {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  const year = new Date().getFullYear();
  return `${tenantCode.toUpperCase()}-${year}-${type.toUpperCase().substring(0, 3)}-${rand}`;
};

// ─── POST /api/license/validate ───────────────────────────────────────────────
router.post('/validate', async (req, res) => {
  const { licenseKey, machineId } = req.body;
  if (!licenseKey) return sendError(res, 400, 'License key is required.');

  try {
    const license = await db('tbl_license_master as l')
      .join('tbl_tenant_master as t', 'l.Tenant_ID', 't.Tenant_ID')
      .where({ 'l.License_Key': licenseKey })
      .select('l.*', 't.Company_Name', 't.Is_Active as Tenant_Active')
      .first();

    if (!license) return sendError(res, 404, 'License key not found.');
    if (license.Is_Revoked) return sendError(res, 403, `License revoked: ${license.Revocation_Reason}`);
    if (!license.Is_Active) return sendError(res, 403, 'License is inactive.');
    if (!license.Tenant_Active) return sendError(res, 403, 'Tenant account is inactive.');
    if (new Date(license.Expiry_Date) < new Date()) {
      return sendError(res, 403, `License expired on ${new Date(license.Expiry_Date).toDateString()}.`);
    }
    if (license.Hardware_ID && machineId && license.Hardware_ID !== machineId) {
      return sendError(res, 403, 'License is bound to a different machine.');
    }

    // Update last verified
    await db('tbl_license_master').where({ License_ID: license.License_ID }).update({ Last_Verified: new Date() });

    return sendSuccess(res, {
      isValid: true,
      tenantId: license.Tenant_ID,
      companyName: license.Company_Name,
      licenseType: license.License_Type,
      expiryDate: license.Expiry_Date,
      maxUsers: license.Max_Users,
      maxBranches: license.Max_Branches,
    }, 'License is valid.');
  } catch (err) {
    console.error('License validate error:', err);
    return sendError(res, 500, 'License validation failed.');
  }
});

// ─── GET /api/license/info ─────────────────────────────────────────────────────
router.get('/info', authenticate, async (req, res) => {
  try {
    const license = await db('tbl_license_master')
      .where({ Tenant_ID: req.user.tenantId })
      .orderBy('Expiry_Date', 'desc')
      .first();

    if (!license) return sendError(res, 404, 'License not found.');

    const daysLeft = Math.ceil((new Date(license.Expiry_Date) - new Date()) / (1000 * 60 * 60 * 24));

    return sendSuccess(res, { ...license, daysLeft });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch license info.');
  }
});

// ─── POST /api/license/create ─────────────────────────────────────────────────
router.post(
  '/create',
  authenticate,
  requireSuperAdmin,
  [
    body('tenantId').trim().notEmpty(),
    body('licenseType').isIn(['Trial', 'Monthly', 'Yearly', 'Perpetual']),
    body('expiryDate').isISO8601(),
    body('maxUsers').isInt({ min: 1 }),
    body('maxBranches').isInt({ min: 1 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    const { tenantId, licenseType, expiryDate, maxUsers, maxBranches, hardwareId } = req.body;

    try {
      const tenant = await db('tbl_tenant_master').where({ Tenant_ID: tenantId }).first();
      if (!tenant) return sendError(res, 404, 'Tenant not found.');

      const licenseKey = generateLicenseKey(tenant.Brand_Code, licenseType);

      const [license] = await db('tbl_license_master').insert({
        License_Key: licenseKey,
        Tenant_ID: tenantId,
        License_Type: licenseType,
        Issued_Date: new Date(),
        Expiry_Date: new Date(expiryDate),
        Max_Users: maxUsers,
        Max_Branches: maxBranches,
        Hardware_ID: hardwareId || null,
        Is_Active: true,
        Created_By: req.user.username,
      }).returning('*');

      // Sync to tenant
      await db('tbl_tenant_master').where({ Tenant_ID: tenantId }).update({
        License_Key: licenseKey,
        License_Expiry_Date: new Date(expiryDate),
        Is_Active: true,
        Max_Users: maxUsers,
        Max_Branches: maxBranches,
      });

      return sendSuccess(res, license, 'License created successfully.', 201);
    } catch (err) {
      console.error('License create error:', err);
      return sendError(res, 500, 'Failed to create license.');
    }
  }
);

// ─── POST /api/license/revoke ─────────────────────────────────────────────────
router.post('/revoke', authenticate, requireSuperAdmin, async (req, res) => {
  const { licenseKey, reason } = req.body;
  if (!licenseKey) return sendError(res, 400, 'License key required.');

  try {
    await db('tbl_license_master')
      .where({ License_Key: licenseKey })
      .update({ Is_Revoked: true, Is_Active: false, Revocation_Reason: reason || 'Revoked by Super Admin' });

    return sendSuccess(res, null, 'License revoked successfully.');
  } catch (err) {
    return sendError(res, 500, 'Failed to revoke license.');
  }
});

module.exports = router;
