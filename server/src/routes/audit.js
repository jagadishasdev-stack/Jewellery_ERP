/**
 * Audit & Security Routes
 * Admin-only: Audit Log, User Activity, Deleted Entries, Edit History,
 *             Active Sessions, Role Permissions
 */
const router = require('express').Router();
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError } = require('../utils/response');
const dayjs = require('dayjs');
const { authenticate, requirePermission } = require('../middleware/auth');

// ── All audit routes require authentication + admin permission ─────────────────
// The file header has always said "Admin-only", and every default role
// already carries a dedicated `audit` permission key (see
// src/db/seeds/001_seed_master_data.js — true for Super Admin/Client
// Admin/Accountant, false for Store Manager/Sales Staff/...), but nothing
// in this file ever actually checked it — only DELETE /sessions/:sessionId
// had its own inline role check. Every other route (the full audit trail
// including Old_Data/New_Data change history, active sessions with IP/
// device info, login history, per-user activity) was reachable by ANY
// authenticated user of ANY role in the tenant. Gating the whole router
// here, once, rather than adding it to each route individually.
router.use(authenticate, requirePermission('audit'));

// FIXED throughout this file: every query below used to reference
// "Created_Date" and "Device_Info" on tbl_audit_log — neither column
// exists on the live table (confirmed via columnInfo()); the real columns
// are "Action_Timestamp" and "Browser_Info" (this table predates the
// Created_Date/Device_Info convention used elsewhere and was never
// migrated to match — see migrations/004 vs. 011's own "already exists,
// only add these 4 columns" branch). Every route touching either column —
// which was effectively the whole file except force-logout — has always
// 500'd for every tenant. tbl_session_master (used by /active-sessions)
// genuinely does have its own Device_Info column — that one reference (see
// below) was already correct and is left untouched.

// ─── GET /api/audit/logs ──────────────────────────────────────────────────────
// Full audit trail with filters
router.get('/logs', async (req, res) => {
  const {
    fromDate, toDate, userId, tableName, actionType,
    search, page = 1, limit = 50,
  } = req.query;

  // Tenant admins see only their tenant; super admin sees all
  const isSuperAdmin = req.user.roleName === 'Super Admin';

  try {
    let qb = db('tbl_audit_log as a')
      .leftJoin('tbl_user_master as u', 'a.User_ID', 'u.User_ID')
      .orderBy('a.Action_Timestamp', 'desc');

    if (!isSuperAdmin) qb = qb.where('a.Tenant_ID', req.user.tenantId);
    if (fromDate) qb = qb.whereRaw(`DATE("a"."Action_Timestamp") >= ?`, [fromDate]);
    if (toDate)   qb = qb.whereRaw(`DATE("a"."Action_Timestamp") <= ?`, [toDate]);
    if (userId)   qb = qb.where('a.User_ID', userId);
    if (tableName) qb = qb.where('a.Table_Name', tableName);
    if (actionType) qb = qb.where('a.Action_Type', actionType);
    if (search) {
      qb = qb.where(function () {
        this.where('a.Username', 'ilike', `%${search}%`)
          .orWhere('a.Record_ID', 'ilike', `%${search}%`)
          .orWhere('a.Description', 'ilike', `%${search}%`);
      });
    }

    const countQb = qb.clone().clearSelect().clearOrder().count('a.Log_ID as total').first();
    const [{ total }] = await Promise.all([countQb]);

    const logs = await qb
      .select(
        'a.Log_ID', 'a.Tenant_ID', 'a.User_ID', 'a.Username', 'a.Full_Name',
        'a.Branch_ID', 'a.Table_Name', 'a.Record_ID', 'a.Action_Type',
        'a.Description', 'a.Old_Data', 'a.New_Data',
        'a.IP_Address', 'a.Browser_Info', 'a.Action_Timestamp',
        'u.Full_Name as User_Full_Name',
      )
      .limit(parseInt(limit))
      .offset((parseInt(page) - 1) * parseInt(limit));

    return sendSuccess(res, { items: logs, total: parseInt(total), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('Audit logs error:', err);
    return sendError(res, 500, 'Failed to fetch audit logs.');
  }
});

// ─── GET /api/audit/user-activity ─────────────────────────────────────────────
// Per-user activity summary
router.get('/user-activity', async (req, res) => {
  const { fromDate, toDate } = req.query;
  const isSuperAdmin = req.user.roleName === 'Super Admin';
  try {
    let qb = db('tbl_audit_log')
      .groupByRaw('"User_ID", "Username", "Full_Name"')
      .select(
        'User_ID', 'Username', 'Full_Name',
        db.raw('COUNT(*) as total_actions'),
        db.raw('COUNT(CASE WHEN "Action_Type" = \'INSERT\' THEN 1 END) as inserts'),
        db.raw('COUNT(CASE WHEN "Action_Type" = \'UPDATE\' THEN 1 END) as updates'),
        db.raw('COUNT(CASE WHEN "Action_Type" = \'DELETE\' THEN 1 END) as deletes'),
        db.raw('COUNT(CASE WHEN "Action_Type" = \'LOGIN\'  THEN 1 END) as logins'),
        db.raw('COUNT(CASE WHEN "Action_Type" = \'PRINT\'  THEN 1 END) as prints'),
        db.raw('MAX("Action_Timestamp") as last_activity'),
      )
      .orderBy('total_actions', 'desc');

    if (!isSuperAdmin) qb = qb.where('Tenant_ID', req.user.tenantId);
    if (fromDate) qb = qb.whereRaw(`DATE("Action_Timestamp") >= ?`, [fromDate]);
    if (toDate)   qb = qb.whereRaw(`DATE("Action_Timestamp") <= ?`, [toDate]);

    return sendSuccess(res, await qb);
  } catch (err) {
    return sendError(res, 500, 'Failed.');
  }
});

// ─── GET /api/audit/deleted-entries ───────────────────────────────────────────
router.get('/deleted-entries', async (req, res) => {
  const isSuperAdmin = req.user.roleName === 'Super Admin';
  try {
    let qb = db('tbl_audit_log')
      .where('Action_Type', 'DELETE')
      .orderBy('Action_Timestamp', 'desc')
      .limit(200);
    if (!isSuperAdmin) qb = qb.where('Tenant_ID', req.user.tenantId);
    return sendSuccess(res, await qb);
  } catch (err) {
    return sendError(res, 500, 'Failed.');
  }
});

// ─── GET /api/audit/edit-history/:table/:recordId ─────────────────────────────
router.get('/edit-history/:table/:recordId', async (req, res) => {
  try {
    const logs = await db('tbl_audit_log')
      .where({ Table_Name: req.params.table, Record_ID: req.params.recordId })
      .whereIn('Action_Type', ['INSERT', 'UPDATE', 'DELETE'])
      .orderBy('Action_Timestamp', 'asc');
    return sendSuccess(res, logs);
  } catch (err) {
    return sendError(res, 500, 'Failed.');
  }
});

// ─── GET /api/audit/active-sessions ───────────────────────────────────────────
router.get('/active-sessions', async (req, res) => {
  const isSuperAdmin = req.user.roleName === 'Super Admin';
  try {
    let qb = db('tbl_session_master as s')
      .leftJoin('tbl_user_master as u', 's.User_ID', 'u.User_ID')
      .where('s.Is_Active', true)
      .select(
        's.Session_ID', 's.Tenant_ID', 's.User_ID', 's.IP_Address',
        's.Device_Info', 's.Session_Start', 's.Session_End',
        'u.Username', 'u.Full_Name',
      )
      .orderBy('s.Session_Start', 'desc');
    if (!isSuperAdmin) qb = qb.where('s.Tenant_ID', req.user.tenantId);
    return sendSuccess(res, await qb);
  } catch (err) {
    return sendError(res, 500, 'Failed.');
  }
});

// ─── DELETE /api/audit/sessions/:sessionId — force logout ─────────────────────
router.delete('/sessions/:sessionId', async (req, res) => {
  if (req.user.roleName !== 'Super Admin' && req.user.roleName !== 'Admin') {
    return sendError(res, 403, 'Admin access required.');
  }
  try {
    await db('tbl_session_master')
      .where('Session_ID', req.params.sessionId)
      .update({ Is_Active: false, Session_End: new Date() });
    return sendSuccess(res, null, 'Session terminated.');
  } catch (err) {
    return sendError(res, 500, 'Failed.');
  }
});

// ─── GET /api/audit/summary ───────────────────────────────────────────────────
// Dashboard analytics summary for admin
router.get('/summary', async (req, res) => {
  const isSuperAdmin = req.user.roleName === 'Super Admin';
  const tenantId = req.user.tenantId;
  const today = dayjs().format('YYYY-MM-DD'); // local (IST) day, not toISOString()'s UTC one

  try {
    const whereClause = isSuperAdmin ? {} : { Tenant_ID: tenantId };

    const [totalLogs]    = await db('tbl_audit_log').where(whereClause).count('Log_ID as c');
    const [todayLogs]    = await db('tbl_audit_log').where(whereClause).whereRaw(`DATE("Action_Timestamp") = ?`, [today]).count('Log_ID as c');
    const [todayLogins]  = await db('tbl_audit_log').where({ ...whereClause, Action_Type: 'LOGIN' }).whereRaw(`DATE("Action_Timestamp") = ?`, [today]).count('Log_ID as c');
    const [activeSess]   = await db('tbl_session_master').where({ ...whereClause, Is_Active: true }).count('Session_ID as c');
    const [deletedToday] = await db('tbl_audit_log').where({ ...whereClause, Action_Type: 'DELETE' }).whereRaw(`DATE("Action_Timestamp") = ?`, [today]).count('Log_ID as c');

    const byAction = await db('tbl_audit_log')
      .where(whereClause)
      .whereRaw(`DATE("Action_Timestamp") = ?`, [today])
      .groupBy('Action_Type')
      .select('Action_Type', db.raw('COUNT(*) as count'));

    const recentActivity = await db('tbl_audit_log')
      .where(whereClause)
      .orderBy('Action_Timestamp', 'desc')
      .limit(10)
      .select('Log_ID', 'Username', 'Full_Name', 'Action_Type', 'Table_Name', 'Description', 'IP_Address', 'Action_Timestamp');

    return sendSuccess(res, {
      totalLogs: parseInt(totalLogs.c),
      todayLogs: parseInt(todayLogs.c),
      todayLogins: parseInt(todayLogins.c),
      activeSessions: parseInt(activeSess.c),
      deletedToday: parseInt(deletedToday.c),
      byAction,
      recentActivity,
    });
  } catch (err) {
    console.error('Audit summary error:', err);
    return sendError(res, 500, 'Failed to fetch audit summary.');
  }
});

// ─── GET /api/audit/login-history ─────────────────────────────────────────────
router.get('/login-history', async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const isSuperAdmin = req.user.roleName === 'Super Admin';
  try {
    let qb = db('tbl_audit_log')
      .whereIn('Action_Type', ['LOGIN', 'LOGOUT', 'LOGIN_FAILED'])
      .orderBy('Action_Timestamp', 'desc');
    if (!isSuperAdmin) qb = qb.where('Tenant_ID', req.user.tenantId);
    const data = await qb.limit(parseInt(limit)).offset((parseInt(page) - 1) * parseInt(limit));
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, 500, 'Failed.');
  }
});

module.exports = router;
