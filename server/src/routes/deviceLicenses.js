/**
 * Per-device Image App licensing — Super Admin only.
 * Only relevant for tenants set to License_Mode='PER_DEVICE' (see
 * TenantManagePage.jsx and mobileAuth.js's license-login). A device files a
 * request (POST /api/mobile/request-device-access, public) before it has any
 * key; this file is where the Super Admin reviews and approves/revokes those
 * requests, generating the device-bound License_Key on approval.
 */
const router = require('express').Router();
const crypto = require('crypto');
const db = require('../db/knex');
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { auditLog } = require('../utils/auditLogger');

router.use(authenticate, requireSuperAdmin);

// ─── GET /api/device-licenses ───────────────────────────────────────────────
// ?tenantId=&status= are both optional filters.
router.get('/', async (req, res) => {
  try {
    let query = db('tbl_device_licenses as d')
      .join('tbl_tenant_master as t', 't.Tenant_ID', 'd.Tenant_ID')
      .select(
        'd.*',
        't.Company_Name',
      )
      .orderBy('d.Requested_Date', 'desc');

    if (req.query.tenantId) query = query.where('d.Tenant_ID', req.query.tenantId);
    if (req.query.status) query = query.where('d.Status', req.query.status);

    const rows = await query;
    return sendSuccess(res, rows);
  } catch (err) {
    console.error('List device licenses error:', err.message);
    return sendError(res, 500, 'Failed to load device license requests.');
  }
});

// ─── POST /api/device-licenses/:id/approve ──────────────────────────────────
// Generates a License_Key that will only ever activate on this Device_ID.
router.post('/:id/approve', async (req, res) => {
  try {
    const row = await db('tbl_device_licenses').where({ Device_License_ID: req.params.id }).first();
    if (!row) return sendError(res, 404, 'Request not found.');
    if (row.Status === 'APPROVED') return sendError(res, 400, 'Already approved.');
    // Only special-cased APPROVED — a REJECTED or REVOKED row fell straight
    // through to a fresh approval, silently overturning that earlier,
    // deliberate decision on the very same row instead of requiring the
    // store to file a brand-new device request. Reusing a rejected/revoked
    // row this way also meant it kept whatever old Device_ID/Contact_Note
    // it was originally filed with, which may no longer be accurate.
    if (row.Status === 'REJECTED' || row.Status === 'REVOKED') {
      return sendError(res, 400, `This request was already ${row.Status.toLowerCase()}. Ask the store to file a new device access request instead of reinstating this one.`);
    }

    const licenseKey = `IMGDEV-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

    const [updated] = await db('tbl_device_licenses')
      .where({ Device_License_ID: req.params.id })
      .update({
        Status: 'APPROVED',
        License_Key: licenseKey,
        Approved_By: req.user.username,
        Approved_Date: new Date(),
      })
      .returning('*');

    await auditLog({
      tenantId: row.Tenant_ID, userId: req.user.userId, tableName: 'tbl_device_licenses',
      recordId: row.Device_License_ID, actionType: 'APPROVE', oldData: row, newData: updated, req,
    });

    return sendSuccess(res, updated, 'Device approved. Share this license key with the store — it only works on this device.');
  } catch (err) {
    console.error('Approve device license error:', err.message);
    return sendError(res, 500, 'Failed to approve device.');
  }
});

// ─── POST /api/device-licenses/:id/revoke ───────────────────────────────────
router.post('/:id/revoke', async (req, res) => {
  try {
    const row = await db('tbl_device_licenses').where({ Device_License_ID: req.params.id }).first();
    if (!row) return sendError(res, 404, 'Request not found.');

    const [updated] = await db('tbl_device_licenses')
      .where({ Device_License_ID: req.params.id })
      .update({ Status: 'REVOKED', Revoked_By: req.user.username, Revoked_Date: new Date() })
      .returning('*');

    await auditLog({
      tenantId: row.Tenant_ID, userId: req.user.userId, tableName: 'tbl_device_licenses',
      recordId: row.Device_License_ID, actionType: 'REVOKE', oldData: row, newData: updated, req,
    });

    return sendSuccess(res, updated, 'Device access revoked. It will be locked out the next time it refreshes its token (within a week).');
  } catch (err) {
    console.error('Revoke device license error:', err.message);
    return sendError(res, 500, 'Failed to revoke device.');
  }
});

// ─── POST /api/device-licenses/:id/reject ───────────────────────────────────
// For a pending request you don't want to approve at all (wrong tenant, etc).
router.post('/:id/reject', async (req, res) => {
  try {
    const row = await db('tbl_device_licenses').where({ Device_License_ID: req.params.id }).first();
    if (!row) return sendError(res, 404, 'Request not found.');
    if (row.Status !== 'PENDING') return sendError(res, 400, 'Only a pending request can be rejected.');

    const [updated] = await db('tbl_device_licenses')
      .where({ Device_License_ID: req.params.id })
      .update({ Status: 'REJECTED', Revoked_By: req.user.username, Revoked_Date: new Date() })
      .returning('*');

    return sendSuccess(res, updated, 'Request rejected.');
  } catch (err) {
    console.error('Reject device license error:', err.message);
    return sendError(res, 500, 'Failed to reject request.');
  }
});

module.exports = router;
