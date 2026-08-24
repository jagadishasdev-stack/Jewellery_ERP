/**
 * Enhanced Audit Logger
 * Captures: User, Tenant, IP, Device, Branch, DateTime, Table, Record,
 *           Action, Old Value, New Value — for full traceability.
 */
const db = require('../db/tenantDb').tenantDb;

/**
 * Main audit log function — non-blocking, never throws.
 * @param {object} opts
 * @param {string}  opts.tenantId
 * @param {number}  opts.userId
 * @param {string}  opts.tableName      - e.g. 'tbl_sales_header'
 * @param {*}       opts.recordId
 * @param {string}  opts.actionType     - INSERT | UPDATE | DELETE | VIEW | LOGIN | LOGOUT | APPROVE | REJECT | PRINT
 * @param {object}  [opts.oldData]      - previous values (for UPDATE/DELETE)
 * @param {object}  [opts.newData]      - new values (for INSERT/UPDATE)
 * @param {string}  [opts.description]  - human readable summary
 * @param {object}  [opts.req]          - Express request object
 */
const auditLog = async ({
  tenantId, userId, tableName, recordId, actionType,
  oldData, newData, description, req,
}) => {
  try {
    const ip = req
      ? (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || 'unknown')
          .split(',')[0].trim()
      : null;

    const userAgent = req?.headers?.['user-agent']?.substring(0, 300) || null;
    const branchId  = req?.user?.branchId || null;
    const username  = req?.user?.username || null;
    const fullName  = req?.user?.fullName  || null;

    await db('tbl_audit_log').insert({
      Tenant_ID:    tenantId   || null,
      User_ID:      userId     || null,
      Username:     username,
      Full_Name:    fullName,
      Branch_ID:    branchId,
      Table_Name:   tableName,
      Record_ID:    recordId ? String(recordId) : null,
      Action_Type:  actionType,
      Description:  description || null,
      Old_Data:     oldData ? JSON.stringify(oldData) : null,
      New_Data:     newData ? JSON.stringify(newData) : null,
      IP_Address:   ip,
      Browser_Info: userAgent,
    });
  } catch (err) {
    // Non-fatal — never block the main transaction
    console.error('[AuditLog] Error (non-fatal):', err.message);
  }
};

/**
 * Convenience: log a field-level diff between oldObj and newObj.
 * Returns the diff object so caller can store it.
 */
const buildDiff = (oldObj = {}, newObj = {}) => {
  const changes = {};
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  allKeys.forEach(k => {
    if (String(oldObj[k] ?? '') !== String(newObj[k] ?? '')) {
      changes[k] = { from: oldObj[k] ?? null, to: newObj[k] ?? null };
    }
  });
  return Object.keys(changes).length ? changes : null;
};

module.exports = { auditLog, buildDiff };
